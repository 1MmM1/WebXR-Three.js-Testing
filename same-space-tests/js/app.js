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
// import { ARComponent, ComponentA, ComponentB } from './components.js';

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

class Location {
  static Above = new Location('Above');
  static Left = new Location('Left');
  static Right = new Location('Right');

  constructor(name) {
    this.name = name
  }
}

// class ARComponent {
//   launch() {}
//   next(experimentNum) {}
// }

// class ComponentA extends ARComponent {
//   launch() {

//   }
//   next(experimentNum) {

//   }
// }

// class ComponentB extends ARComponent {
//   launch() {

//   }
//   next(experimentNum) {

//   }
// }

// anchorNode = null;


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

      // Create info box
      this.createInfoScreen();

      // Create the canvas that will contain our camera's background and our virtual scene.
      this.createXRCanvas();

      // With everything set up, start the app.
      await this.onSessionStarted();
    } catch(e) {
      onNoXRDevice();
    }
  }


  createInfoScreen() {
    // this.infoBox = document.createElement("div");
    this.infoBox = document.getElementById("info-box");
    this.infoBox.style.backgroundColor = "white";
    this.infoBox.style.position = "fixed";
    this.infoBox.style.bottom = "0";
    document.body.appendChild(this.infoBox);
    const label = document.createElement("P");
    label.textContent = "Click counts";
    this.infoBox.appendChild(label);
    this.cubeInfoAreas = [document.createElement("P"), document.createElement("P"), document.createElement("P"), document.createElement("P")]
    for (let i = 0; i < this.cubeInfoAreas.length; i++) {
      this.cubeInfoAreas[i].textContent = "Cube " + (i + 1) + ": not initialized";
      // this.cubeInfoAreas[i].appendChild(document.createTextNode("Cube " + (i + 1) + ": 0"));
      this.infoBox.appendChild(this.cubeInfoAreas[i]);
    }
    console.log(this.cubeInfoAreas);
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
    // document.getElementById("enter-ar-info").style.display = "none";
    // document.getElementById("unsupported-info").style.display = "none";

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
    window.addEventListener("pointerdown", this.onTouchEnd);

    this.anchoredObjects = [];
    this.objectLabels = new Map();
  }

  /**
   * Called by the event listener for screen taps 
   */
  onTouchEnd = (event) => {
    // try make raycaster a field
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(+(event.clientX / window.innerWidth) * 2 +-1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouse, this.camera);

    var intersects = raycaster.intersectObjects(this.anchoredObjects);
    console.log("intersects:", intersects.length);
    if (intersects.length > 0) {
      const currObj = intersects[0].object;
      // show or hide the label
      // this.objectLabels.get(currObj.name).visible = !this.objectLabels.get(currObj.name).visible;
      // console.log(this.objectLabels);
      currObj.clickCount++;
      this.cubeInfoAreas[currObj.name - 1].textContent = this.makeClickText(currObj.name, currObj.clickCount);
      console.log(currObj.name, currObj.clickCount);
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
      const cubeSize = 0.1;

      frame.createAnchor(anchorPose, inputSource.targetRaySpace).then((anchor) => {

        anchor.context = { "sceneObjects": [] };

        // first batch of cubes
        this.componentA(anchor, position, cubeSize);

        // second batch of cubes
        this.componentB(anchor, position, cubeSize);
      }, (error) => {
        console.error("Could not create anchor: " + error);
      });
    }
  }

  componentA = (anchor, position, cubeSize) => {
    // let cubeSet1 = [this.makeCube("1", position.x, position.y, position.z, cubeSize, 0xff0000, Location.Left, 0),
    //                     this.makeCube("2", position.x + 2 * cubeSize, position.y, position.z, cubeSize, 0xff0000, Location.Above, 0),]
    // Promise.all(cubeSet1)
    //   .then(results => {
    //     for (let i = 0; i < results.length; i++) {
    //       this.cubeInfoAreas[i].textContent = this.makeClickText(i + 1, 0);
    //       anchor.context.sceneObjects.push(results[i]);
    //       this.scene.add(results[i]);
    //     }
    //     console.log("anchoredObjects:", this.anchoredObjects);
    //   });
    let cube1 = this.makeCube("1", position.x, position.y, position.z, cubeSize, 0xff0000, Location.Left, 0);
    this.cubeInfoAreas[0].textContent = this.makeClickText(1, 0);
    anchor.context.sceneObjects.push(cube1);
    this.scene.add(cube1);

    let cube2 = this.makeCube("2", position.x + 2 * cubeSize, position.y, position.z, cubeSize, 0xff0000, Location.Above, 0);
    this.cubeInfoAreas[1].textContent = this.makeClickText(2, 0);
    anchor.context.sceneObjects.push(cube2);
    this.scene.add(cube2);
  }

  componentB = (anchor, position, cubeSize) => {
    // let cubeSet2 = [this.makeCube("3", position.x, position.y, position.z, cubeSize, 0x0000ff, Location.Right, 2000),
    //                 this.makeCube("4", position.x - 2 * cubeSize, position.y, position.z, cubeSize, 0x0000ff, Location.Above, 2000),]
    // Promise.all(cubeSet2)
    //   .then(results => {
    //     for (let i = 0; i < results.length; i++) {
    //       this.cubeInfoAreas[i + 2].textContent = this.makeClickText(i + 3, 0);
    //       anchor.context.sceneObjects.push(results[i]);
    //       this.scene.add(results[i]);
    //     }
    //     // console.log("anchoredObjects:", this.anchoredObjects);
    //   });

    let cube3 = this.makeCube("3", position.x, position.y, position.z, cubeSize, 0x0000ff, Location.Right, 2000)
    this.cubeInfoAreas[2].textContent = this.makeClickText(3, 0);
    anchor.context.sceneObjects.push(cube3);
    this.scene.add(cube3);

    let cube4 = this.makeCube("4", position.x - 2 * cubeSize, position.y, position.z, cubeSize, 0x0000ff, Location.Above, 2000)
    this.cubeInfoAreas[3].textContent = this.makeClickText(4, 0);
    anchor.context.sceneObjects.push(cube4);
    this.scene.add(cube4);
  }

  makeClickText = (cubeId, clickCount) => {
     return "Cube " + cubeId + ": " + clickCount;
  }

  // buyNow = () => {
  //   console.log("You just bought a new computer!");
  // }

  // makeTransparentCube = async (name, x, y, z, size, hexColor, transparency, action, delay) => {
  //   return new Promise(resolve => {
  //       setTimeout(() => {
  //         const geometry = new THREE.BoxGeometry(size, size, size);
  //         const material = new THREE.MeshBasicMaterial({color: hexColor, transparent: true, opacity: transparency});
  //         const cube = new THREE.Mesh(geometry, material);
  //         cube.geometry.translate(x, y, z);
  //         cube.name = name;
  //         cube.associatedAction = action;

  //         // create new label for the cube but don't add it to object list so it's not interactable
  //         cube.label = this.makeCubeMarker(name, x, y + size, z, hexColor, name);

  //         this.anchoredObjects.push(cube);
  //         console.log(cube.name, Date.now());
  //         resolve(cube);
  //       }, delay);
  //     });
  // }

  makeCube = (name, x, y, z, size, hexColor, labelLocation, delay) => {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshBasicMaterial({color: hexColor});
    const cube = new THREE.Mesh(geometry, material);
    cube.geometry.translate(x, y, z);
    cube.name = name;
    cube.clickCount = 0;

    // create new label for the cube but don't add it to object list so it's not interactable
    switch (labelLocation) {
      case Location.Above:
        this.makeCubeMarker(name, x, y + size, z, hexColor, name);
        break;
      case Location.Left:
        this.makeCubeMarker(name, x + size / 2, y + size, z, hexColor, name);
        break;
      case Location.Right:
        this.makeCubeMarker(name, x - size / 2, y + size, z, hexColor, name);
        break;
      default:
        break;
    }

    this.anchoredObjects.push(cube);
    console.log(cube.name, Date.now());
    return cube;
  }

  makeCubeMarker = (name, x, y, z, hexColor, parentName) => {
    const loader = new THREE.FontLoader();
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
      text.visible = true;
      finalObjectLabels.set(parentName, text);
      finalScene.add(text);
    });
  }

  onYesClick = (event) => {
      // After 3 seconds, remove the show class from DIV
      var x = document.getElementById("snackbar");
      x.className = "";
      this.removeObjectByName("Cube 2 Mesh");
      this.wallPlaced = false;
  }

  onNoClick = (event) => {
    alert("ERROR");
    // After 3 seconds, remove the show class from DIV
    var x = document.getElementById("snackbar");
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
  }

  onNextClick = (event) => {
    this.removeObjectByName("Cube 2 Mesh");
    this.shouldDisplayTransparentCube = true;
    this.transparencyType ++;
    if (this.transparencyType > 3) {
      var next = document.getElementById("nextButton")
      next.style.visibility = 'hidden';
      var x = document.getElementById("snackbar");
      x.className = "";

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

      // if (!this.singleAnchor) {
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
      // } 

      // Render the scene with THREE.WebGLRenderer.
      this.renderer.render(this.scene, this.camera);
    }
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
