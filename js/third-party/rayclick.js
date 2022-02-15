// Third party library for using raycasting to handle click events

// args: array of arguments to be passed into the clickHandler
export function handleIfClicked(object, event, camera, clickHandler, args) {
	const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObjects([object]);
    if (intersects.length == 1) {
	    console.log("intersects!");
	    clickHandler(...args);
	}
}

