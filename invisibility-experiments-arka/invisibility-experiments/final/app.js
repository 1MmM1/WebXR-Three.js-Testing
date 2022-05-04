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

import {changeColorOnIntersect, sendProgrammedRaycasts} from './interactions.js';
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
var canRender = false;
var snooperBox;
var shouldSnoop = true;
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
        requiredFeatures: ['hit-test', 'dom-overlay', 'anchors'],
        domOverlay: { root: document.body }
      });

      // Create the canvas that will contain our camera's background and our virtual scene.
      this.createXRCanvas();

      // With everything set up, start the app.
      await this.onSessionStarted();
    } catch(e) {
      console.log(e);
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
   * renderer, scene, and camera and attach our XRWebGLLayer to the
   * XRSession and kick off the render loop.
   */
  onSessionStarted = async () => {
    // Add the `ar` class to our body, which will hide our 2D components
    document.body.classList.add('ar');

    // To help with working with 3D on the web, we'll use three.js.
    this.setupThreeJs();

    // Setup an XRReferenceSpace using the "local" coordinate system.
    this.localReferenceSpace = await this.xrSession.requestReferenceSpace('local');

    // Create another XRReferenceSpace that has the viewer as the origin.
    this.viewerSpace = await this.xrSession.requestReferenceSpace('viewer');
    // Perform hit testing using the viewer as origin.
    this.hitTestSource = await this.xrSession.requestHitTestSource({ space: this.viewerSpace });

    this.anchoredObjects = []
    this.meshes = []
    this.anchorPlaced = false
    
    this.componentBEnabled = false;

    this.wallPlaced = false
    this.shouldDisplayInitialCube = true;
    this.shouldDisplayTransparentCube = false;
    // Start a rendering loop using this.onXRFrame.
    this.xrSession.requestAnimationFrame(this.onXRFrame);

    this.shouldDisplay = true;
    this.xrSession.addEventListener("select", this.onSelect);
    window.addEventListener("pointerdown", this.onTouchEnd);

    this.createInfoScreen();
    this.transparencyType = 0;
    this.objectLabels = new Map();
  }

  createInfoScreen() {
    this.infoBox = document.createElement("div");
    this.infoBox.style.backgroundColor = "white";
    this.infoBox.style.position = "fixed";
    this.infoBox.style.top = "0";
    document.body.appendChild(this.infoBox);
    const label = document.createElement("P");
    label.textContent = "Click counts";
    this.infoBox.appendChild(label);
    this.cubeInfoAreas = []
  }

  updateInfoScreen() {
    for (let i = 0; i < this.meshes.length; i++)
    {
      if (i < this.cubeInfoAreas.length)
      {
        this.cubeInfoAreas[i].textContent = "Cube " + (i + 1) + ": " + this.meshes[i].clickCount;
      } else
      {
        var cubeInfo = document.createElement("P");
        cubeInfo.textContent = "Cube " + (i + 1) + ": not initialized";
        this.cubeInfoAreas.push(cubeInfo);
        // this.cubeInfoAreas[i].appendChild(document.createTextNode("Cube " + (i + 1) + ": 0"));
        this.infoBox.appendChild(this.cubeInfoAreas[i]);
      }
    }
  }

  makeCubeMarker = (name, x, y, z, hexColor, parentName) => {
    const loader = new THREE.FontLoader();
    const finalObjectLabels = this.objectLabels;
    const finalScene = this.scene;

    loader.load( './fonts/helvetiker_regular.typeface.json', function (font) {
      const textGeometry = new THREE.TextGeometry(name, {
              font: font,
              size: 0.05,
              height: 0.001,
              curveSegments: 12}); 
      const textMaterials = [
            new THREE.MeshPhongMaterial( { color: hexColor, flatShading: true } ), // front
            new THREE.MeshPhongMaterial( { color: hexColor } ) // side
          ];
      const text = new THREE.Mesh( textGeometry, textMaterials );
      text.geometry.translate(x, y, z);
      text.name = name;
      text.visible = true;
      finalObjectLabels.set(parentName, text);
      finalScene.add(text);
    });
  }

  removeObjectByName = (objectName) =>
  {
    var selectedObject = this.scene.getObjectByName(objectName);
    selectedObject.geometry.dispose();
    selectedObject.material.dispose();
    this.scene.remove( selectedObject );
    this.renderer.renderLists.dispose();
    var newMeshes = []
    for(let i = 0; i < this.meshes.length; i++)
    {
      if(this.meshes[i].name != objectName)
      {
        newMeshes.push(this.meshes[i])
      }
    }
    this.meshes = newMeshes;
  }

  onYesClick = (event) =>
  {
      // After 3 seconds, remove the show class from DIV
      console.log("CLICKED!")
      var x = document.getElementById("snackbar");
      x.className = "";
      this.removeObjectByName("Cube 2 Mesh");
      this.wallPlaced = false;
  }

  onNoClick = (event) =>
  {
    alert("ERROR");
    // After 3 seconds, remove the show class from DIV
    var x = document.getElementById("snackbar");
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
  }

  onNextClick = (event) =>
  {
    this.removeObjectByName("Cube 2 Mesh");
    this.shouldDisplayTransparentCube = true;
    this.transparencyType ++;
    if (this.transparencyType > 2)
    {
      var next = document.getElementById("nextButton")
      next.style.visibility = 'hidden';
      var x = document.getElementById("snackbar");
      x.className = "";

    }
    console.log("CLICKED!")

    this.wallPlaced = false;
  }

  addAnchoredBoxToScene  = (anchor, material) =>
  {

    console.debug("Anchor created");

    anchor.context = {};

    var geometry = new THREE.BoxGeometry( 0.2, 0.2, 0.2 ).translate( 0, 0.1, 0 );
    // var material = new THREE.MeshPhongMaterial( { color: 0xffffff * Math.random() } );
    var mesh = this.addBoxToScene(material, geometry)
    this.reticle.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale );
    anchor.context.sceneObject = mesh;
    mesh.anchor = anchor;
    this.anchoredObjects.push(mesh);
    this.scene.add( mesh );
    console.log("Added mesh");
    return mesh;
    
  }

  addBoxToScene = (material, geometry) =>
  {
    var mesh = new THREE.Mesh( geometry, material );
    mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox.expandByScalar(3.0);
    mesh.clickCount = 0;
    this.meshes.push(mesh);
    return mesh;
  }

  showToast = (content) => { //You can change the default value
    // Get the snackbar DIV
    var x = document.getElementById("snackbar");
    
    //Change the text (not mandatory, but I think you might be willing to do it)
    x.innerHTML = content;
  
    // Add the "show" class to DIV
    x.className = "show";
  
    // After 3 seconds, remove the show class from DIV
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
  }

  displayToUser = (content) =>
  {
    if(this.shouldDisplay)
    {
      var x = document.getElementById("snackbar-content");
      x.innerHTML = content;
      var y = document.getElementById("snackbar");
      y.className = "show"
      this.shouldDisplay = false;
    }
  }
  
  componentA = (anchor) =>
  {
    var material = new THREE.MeshPhongMaterial( { color: 0xff0000} );
    var mesh = this.addAnchoredBoxToScene(anchor, material);
    mesh.name = "Cube 1 Mesh";
    this.makeCubeMarker("Cube 1",mesh.position.x, mesh.position.y + 0.25, mesh.position.z,0xffffff, mesh.name);
  }

  componentB = (referenceMesh) =>
  {
    if (this.shouldDisplayInitialCube)
    {
      var geometry = new THREE.BoxGeometry( 0.8, 0.8, 0.02 ).translate( 0, 0.1, 0 );
      var material = new THREE.MeshPhongMaterial( { color: 0x0000ff, transparent: true} );
  
      var mesh = this.addBoxToScene(material, geometry);
      referenceMesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.position.set(mesh.position.x, mesh.position.y, mesh.position.z + 0.5);
      mesh.name = "Cube 2 Mesh";
      this.scene.add(mesh);
      this.makeCubeMarker("Cube 2",mesh.position.x, mesh.position.y + 0.2, mesh.position.z,0xffffff, mesh.name);
      this.displayToUser("Verify that you can see Cube 2 but not Cube 1");
      this.shouldDisplayInitialCube = false;
      this.shouldDisplayTransparentCube = true;
    } 
    else if (this.shouldDisplayTransparentCube)
    {
      if(this.transparencyType == 0)
      {
        var geometry = new THREE.BoxGeometry(0.8, 0.8, 0.02 ).translate( 0, 0.1, 0 );
        var material = new THREE.MeshPhongMaterial( { color: 0x0000ff, transparent: true, opacity: 0} );
    
        var mesh = this.addBoxToScene(material, geometry);
        referenceMesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.position.set(mesh.position.x, mesh.position.y, mesh.position.z + 0.5);
        mesh.name = "Cube 2 Mesh";
        this.scene.add(mesh);
        this.makeCubeMarker("Cube 2",mesh.position.x, mesh.position.y + 1, mesh.position.z,0xffffff, mesh.name);

        this.shouldDisplayTransparentCube = false;

        var yesButton = document.getElementById("yesButton");
        yesButton.style.visibility = 'hidden';
        var noButton = document.getElementById("noButton");
        noButton.style.visibility = 'hidden';
        var nextButton = document.getElementById("nextButton");
        nextButton.style.visibility = 'visible';

        this.displayToUser("Try to click on Cube 1 and verify whether you can or cannot, then press next");
      } else if (this.transparencyType == 1)
      {
        // // Disable rendering
        var geometry = new THREE.BoxGeometry( 0.8, 0.8, 0.02 ).translate( 0, 0.1, 0 );
        var material = new THREE.MeshPhongMaterial( { color: 0x0000ff, transparent: true, opacity: 0} );
    
        var mesh = this.addBoxToScene(material, geometry);
        referenceMesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.position.set(mesh.position.x, mesh.position.y, mesh.position.z + 0.5);
        mesh.name = "Cube 2 Mesh";
        mesh.visible = false;
        this.scene.add(mesh);
        this.makeCubeMarker("Cube 2" ,mesh.position.x, mesh.position.y + 0.2, mesh.position.z,0xffffff, mesh.name);

        this.shouldDisplayTransparentCube = false;
        this.transparencyType = 2;

        this.displayToUser("Try to click on Cube 1 and verify whether you can or cannot, then press next");

      }
    }

  }

  /** Place a object when the screen is tapped. */
  onSelect = (event) => {
    this.shouldDisplay = true;
    let frame = event.frame;
    let session = frame.session;
    let anchorPose = new XRRigidTransform();
    let inputSource = event.inputSource;
    var position = this.reticle.position;
    if (!this.anchorPlaced  && !this.componentBEnabled)
    {
      // Create a free-floating anchor.
      frame.createAnchor(anchorPose, inputSource.targetRaySpace).then((anchor) => {
        this.componentA(anchor);
        this.anchorPlaced = true;
        this.componentBEnabled = true;
      }, (error) => {
        console.error("Could not create anchor: " + error);
      });
    } 
    else if (this.componentBEnabled)
    {
      if (!this.wallPlaced)
      {
        this.componentB(this.anchoredObjects[0]);
        this.wallPlaced = true;
      }
    }
    this.updateInfoScreen();
  }

  onTouchEnd = (event) =>
  {
    if (this.anchorPlaced)
    {
      if (this.componentBEnabled)
      {
        // Add interaction with cube 1
        this.mouse.x = +(event.clientX / window.innerWidth) * 2 +-1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        // var selectedObject = this.scene.getObjectByName("testcube");
        var mesh = changeColorOnIntersect(this.raycaster, this.scene.children);
        if(mesh != null)
        {
          mesh.clickCount++;
        }
      }
    }
    this.updateInfoScreen();
  }

  /**
   * Called on the XRSession's requestAnimationFrame.
   * Called with the time and XRPresentationFrame.
   */                                                                         
  onXRFrame = (time, frame) => {
    // Queue up the next draw request.
    this.xrSession.requestAnimationFrame(this.onXRFrame);

    // Bind the graphics framebuffer to the baseLayer's framebuffer.
    const framebuffer = this.xrSession.renderState.baseLayer.framebuffer
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer)
    this.renderer.setFramebuffer(framebuffer);

    // Retrieve the pose of the device.
    // XRFrame.getViewerPose can return null while the session attempts to establish tracking.
    const pose = frame.getViewerPose(this.localReferenceSpace);
    if (pose) {
      // In mobile AR, we only have one view.
      const view = pose.views[0];

      const viewport = this.xrSession.renderState.baseLayer.getViewport(view);
      this.renderer.setSize(viewport.width, viewport.height)

      // Use the view's transform matrix and projection matrix to configure the THREE.camera.
      this.camera.matrix.fromArray(view.transform.matrix)
      this.camera.projectionMatrix.fromArray(view.projectionMatrix);
      this.camera.updateMatrixWorld(true);

      // Conduct hit test.
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);

      // If we have results, consider the environment stabilized. 
      if (!this.stabilized && hitTestResults.length > 0) {
        this.stabilized = true;
        document.body.classList.add('stabilized');
      }
      if (hitTestResults.length > 0) {
        const hitPose = hitTestResults[0].getPose(this.localReferenceSpace);

        // Update the reticle position
        this.reticle.visible = true;
        this.reticle.position.set(hitPose.transform.position.x, hitPose.transform.position.y, hitPose.transform.position.z)
        this.reticle.updateMatrixWorld(true);
      }

      // Render the scene with THREE.WebGLRenderer.
      this.renderer.render(this.scene, this.camera)
    }
  }

  /**
   * Initialize three.js specific rendering code, including a WebGLRenderer,
   * a demo scene, and a camera for viewing the 3D content.
   */
  setupThreeJs() {
    // To help with working with 3D on the web, we'll use three.js.
    // Set up the WebGLRenderer, which handles rendering to our session's base layer.
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2( 1, 1 );

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
    var yes = document.getElementById("yesButton");
    yes.addEventListener("click", this.onYesClick);
    var no = document.getElementById("noButton");
    no.addEventListener("click", this.onNoClick);
    var next = document.getElementById("nextButton");
    next.style.visibility = 'hidden';
    next.addEventListener("click", this.onNextClick);
  }
};

window.app = new App();
