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

// import * as RayClick from './third-party/rayclick.js';
// import * as ExpandedShapes from './third-party/expanded-shapes.js';
import { FontLoader } from '../jsm/loaders/FontLoader.js';

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
    this.objectLabels = new Map();
  }

  /**
   * Called by the event listener for screen taps 
   */
  onClick = (event) => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    raycaster.setFromCamera(mouse, this.camera);

    var intersects = raycaster.intersectObjects(this.anchoredObjects);
    console.log("intersects:", intersects.length);
    if (intersects.length > 0) {
      let toRemove = 0;
      while(toRemove < intersects.length && 
        (!intersects[toRemove].object.visible || 
          intersects[toRemove].object.material.opacity == 0)) {
        toRemove++;
      }
      if (toRemove < intersects.length) {
        // show or hide the label
        this.objectLabels.get(intersects[toRemove].object.name).visible = !this.objectLabels.get(intersects[toRemove].object.name).visible;
      }
    }
  }

  /**
   * Called by the event listener for screen taps 
   */
  onSelect = (event) => {
    if (!this.singleAnchor) {
      console.debug("Creating anchor...");
      this.singleAnchor = true;

      let frame = event.frame;
      let session = frame.session;
      let anchorPose = new XRRigidTransform();
      let inputSource = event.inputSource;
      const position = this.reticle.position;

      frame.createAnchor(anchorPose, inputSource.targetRaySpace).then((anchor) => {

        anchor.context = { "sceneObjects": [] };

        let promises = [this.makeTransparentCube("cubeT", position.x, position.y, position.z, 0.1, 0x000000, 0, (msg) => { console.log(msg); }, 500),
                        this.makeCube("cube1", position.x, position.y, position.z, 0.1, 0xaa0000, (msg) => { console.log(msg); }, 500),]
        Promise.all(promises)
          .then(results => {
            for (let i = 0; i < results.length; i++) {
              anchor.context.sceneObjects.push(results[i]);
              this.scene.add(results[i]);
            }
            console.log("anchoredObjects:", this.anchoredObjects);
          });
      }, (error) => {
        console.error("Could not create anchor: " + error);
      });
    } else {
      console.log("Already have anchor: ", this.singleAnchor);
    }
  }

  buyNow = () => {
    console.log("You just bought a new computer!");
  }

  makeTransparentCube = async (name, x, y, z, size, hexColor, transparency, action, delay) => {
    return new Promise(resolve => {
        setTimeout(() => {
          const geometry = new THREE.BoxGeometry(size, size, size);
          const material = new THREE.MeshBasicMaterial({color: hexColor, transparent: true, opacity: transparency});
          const cube = new THREE.Mesh(geometry, material);
          cube.geometry.translate(x, y, z);
          cube.name = name;
          cube.associatedAction = action;

          // create new label for the cube but don't add it to object list so it's not interactable
          cube.label = this.makeCubeMarker(name, x, y + size, z, hexColor, name);

          this.anchoredObjects.push(cube);
          console.log(cube.name, Date.now());
          resolve(cube);
        }, delay);
      });
  }

  makeCube = async (name, x, y, z, size, hexColor, action, delay) => {
    return new Promise(resolve => {
        setTimeout(() => {
          const geometry = new THREE.BoxGeometry(size, size, size);
          const material = new THREE.MeshBasicMaterial({color: hexColor});
          const cube = new THREE.Mesh(geometry, material);
          cube.geometry.translate(x, y, z);
          cube.name = name;

          // create new label for the cube but don't add it to object list so it's not interactable
          cube.label = this.makeCubeMarker(name, x, y + size, z, hexColor, name);

          this.anchoredObjects.push(cube);
          console.log(cube.name, Date.now());
          resolve(cube);
        }, delay);
      });
  }

  makeCubeMarker = (name, x, y, z, hexColor, parentName) => {
    const loader = new FontLoader();
    const finalObjectLabels = this.objectLabels;
    const finalScene = this.scene;

    loader.load( './fonts/helvetiker_regular.typeface.json', function (font) {
      const textGeometry = new THREE.TextGeometry(name, {
              font: font,
              size: 0.1,
              height: 0.01,
              curveSegments: 12});
      const textMaterials = [
            new THREE.MeshPhongMaterial( { color: hexColor, flatShading: true } ), // front
            new THREE.MeshPhongMaterial( { color: hexColor } ) // side
          ];
      const text = new THREE.Mesh( textGeometry, textMaterials );
      text.geometry.translate(x, y, z);
      text.name = name + "_label";
      text.visible = false;
      finalObjectLabels.set(parentName, text);
      finalScene.add(text);
    });
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
