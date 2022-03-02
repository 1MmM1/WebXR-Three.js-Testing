/*
 * Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as RayClick from './third-party/rayclick.js';
import * as ExpandedShapes from './third-party/expanded-shapes.js'

/**
 * Query for WebXR support. If there's no support for the `immersive-ar` mode,
 * show an error.
 */
(async function() {
  const isArSessionSupported = navigator.xr && navigator.xr.isSessionSupported && await navigator.xr.isSessionSupported("immersive-ar");
  if (isArSessionSupported) {
    document.getElementById("enter-ar").addEventListener("click", window.app.activateXR)
  } else {
    onNoXRDevice();
  }
})();

/**
 * Container class to manage connecting to the WebXR Device API
 * and handle rendering on every frame.
 */
class App {
  /**
   * Run when the Start AR button is pressed.
   */
  activateXR = async () => {
    try {
      // Initialize a WebXR session using "immersive-ar".
      this.xrSession = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["anchors", "hit-test", "dom-overlay"],
        domOverlay: { root: document.body }
      });

      // Create the canvas that will contain our camera's background and our virtual scene.
      this.createXRCanvas();

      // With everything set up, start the app.
      await this.onSessionStarted();
    } catch(e) {
    	console.error(e);
      onNoXRDevice();
    }
  }

  /**
   * Add a canvas element and initialize a WebGL context that is compatible with WebXR.
   */
  createXRCanvas() {
    this.canvas = document.createElement("canvas");
    document.body.appendChild(this.canvas);
    this.gl = this.canvas.getContext("webgl", {xrCompatible: true});

    this.xrSession.updateRenderState({
      baseLayer: new XRWebGLLayer(this.xrSession, this.gl)
    });
  }

  /**
   * Called when the XRSession has begun. Here we set up our three.js
   * renderer and kick off the render loop.
   */
  async onSessionStarted() {
    // Add the `ar` class to our body, which will hide our 2D components
    document.body.classList.add('ar');

    // To help with working with 3D on the web, we'll use three.js.
    this.setupThreeJs();

    // Setup an XRReferenceSpace using the "local" coordinate system.
    this.localReferenceSpace = await this.xrSession.requestReferenceSpace("local");

    // Create another XRReferenceSpace that has the viewer as the origin.
    this.viewerSpace = await this.xrSession.requestReferenceSpace("viewer");
    // Perform hit testing using the viewer as origin.
    this.hitTestSource = await this.xrSession.requestHitTestSource({ space: this.viewerSpace });

    // Start a rendering loop using this.onXRFrame.
    this.xrSession.requestAnimationFrame(this.onXRFrame);

    // Set up event listener
    this.xrSession.addEventListener("select", this.onSelect);
    this.renderer.domElement.addEventListener("click", this.onClick);

    this.anchoredObjects = [];
  }

  /**
   * Called by the event listener for screen taps 
   */
  onClick = (event) => {
    // object, event, camera, clickHandler, args  
    console.log("------------ new click ------------");
  }

  /**
   * Called by the event listener for screen taps 
   */
  onSelect = (event) => {
    console.log("------------ new select ------------");
    if (!this.singleAnchor) {
    	// plane to reflect
    	var floorTexture = new THREE.ImageUtils.loadTexture( 'images/checkerboard.jpg' );
			floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; 
			floorTexture.repeat.set( 10, 10 );
			var floorMaterial = new THREE.MeshBasicMaterial( { map: floorTexture, side:THREE.BackSide } );
			var floorGeometry = new THREE.PlaneGeometry(1, 1);
			var floor = new THREE.Mesh(floorGeometry, floorMaterial);
			floor.position.x = this.reticle.position.x;
			floor.position.y = this.reticle.position.y + 0.5; 
			floor.position.z = this.reticle.position.z;
			floor.rotation.x = Math.PI / 2;
			this.scene.add(floor);


	    // Mirrored cube
			const cubeGeom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
			const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( 128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter } );
			this.mirrorCubeCamera = new THREE.CubeCamera( 0.1, 5000, cubeRenderTarget );
			this.scene.add( this.mirrorCubeCamera );
			const mirrorCubeMaterial = new THREE.MeshPhongMaterial( { envMap: this.mirrorCubeCamera.renderTarget.texture } );
			this.mirrorCube = new THREE.Mesh( cubeGeom, mirrorCubeMaterial );
			this.mirrorCube.name = "mirrorCube";
			this.mirrorCube.geometry.translate(this.reticle.position.x + 0.3, this.reticle.position.y, this.reticle.position.z);
			// this.mirrorCubeCamera.position = this.mirrorCube.position;
			this.scene.add(this.mirrorCube);	
			
			// Mirror sphere
			const sphereGeom =  new THREE.SphereGeometry( 0.1, 32, 16 ); // radius, segmentsWidth, segmentsHeight
			const sphereRenderTarget = new THREE.WebGLCubeRenderTarget( 128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter } );
			this.mirrorSphereCamera = new THREE.CubeCamera( 0.1, 5000, sphereRenderTarget );
			this.scene.add( this.mirrorSphereCamera );	
			const mirrorSphereMaterial = new THREE.MeshPhongMaterial( { envMap: this.mirrorSphereCamera.renderTarget.texture } );
			this.mirrorSphere = new THREE.Mesh( sphereGeom, mirrorSphereMaterial );
			this.mirrorSphere.name = "mirrorSphere";
			this.mirrorSphere.geometry.translate(this.reticle.position.x, this.reticle.position.y, this.reticle.position.z);
			// this.mirrorSphereCamera.position = this.mirrorSphere.position;
			this.scene.add(this.mirrorSphere);
			this.singleAnchor = true;
    }
  }

  /**
   * Called on the XRSession's requestAnimationFrame.
   * Called with the time and XRPresentationFrame.
   */
  onXRFrame = (time, frame) => {
    /** TODO draw the application */
    this.xrSession.requestAnimationFrame(this.onXRFrame); // Queue up the next draw request.
    
    // Bind the graphics framebuffer to the baseLayer's framebuffer.
    const framebuffer = this.xrSession.renderState.baseLayer.framebuffer;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.renderer.setFramebuffer(framebuffer);

    // Retrieve the pose of the device.
    // XRFrame.getViewerPose can return null while the session attempts to establish tracking.
    const pose = frame.getViewerPose(this.localReferenceSpace);
    if (pose) {
      // In mobile AR, we only have one view.
      const view = pose.views[0];

      const viewport = this.xrSession.renderState.baseLayer.getViewport(view);
      this.renderer.setSize(viewport.width, viewport.height);

      // Use the view's transform matrix and projection matrix to configure the THREE.camera.
      this.camera.matrix.fromArray(view.transform.matrix);
      this.camera.projectionMatrix.fromArray(view.projectionMatrix);
      this.camera.updateMatrixWorld(true);

      if (!this.singleAnchor) {
        // Perform hit test
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);

        if (!this.stabilized && hitTestResults.length > 0) {
          this.stabilized = true;
          document.body.classList.add("stabilized");
        }
        if (hitTestResults.length > 0) {
          const hitPose = hitTestResults[0].getPose(this.localReferenceSpace);

          // update the reticle position
          this.reticle.visible = true;
          this.reticle.position.set(hitPose.transform.position.x, hitPose.transform.position.y, hitPose.transform.position.z)
          this.reticle.updateMatrixWorld(true);
        }
      } 

      if (this.mirrorCube && this.mirrorSphere) {
      	// console.log("updating mirror objects");
      	this.mirrorCube.visible = false;
				this.mirrorCubeCamera.update( this.renderer, this.scene );
				this.mirrorCube.visible = true;

				this.mirrorSphere.visible = false;
				this.mirrorSphereCamera.update( this.renderer, this.scene );
				this.mirrorSphere.visible = true;
      }

      // Render the scene with THREE.WebGLRenderer.
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Initialize three.js specific rendering code, including a WebGLRenderer,
   * a demo scene, and a camera for viewing the 3D content.
   */
  setupThreeJs() {
    // To help with working with 3D on the web, we'll use three.js.
    // Set up the WebGLRenderer, which handles rendering to our session's base layer.
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
      canvas: this.canvas,
      context: this.gl
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Initialize our demo scene.
    this.scene = DemoUtils.createLitScene();
    this.reticle = new Reticle();
    this.scene.add(this.reticle);

    // We'll update the camera matrices directly from API, so
    // disable matrix auto updates so three.js doesn't attempt
    // to handle the matrices independently.
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;
  }
};

window.app = new App();
