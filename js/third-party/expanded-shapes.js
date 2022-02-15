export class Cube extends THREE.Mesh {
	constructor(name, sideLen, hexColor, location, clickHandler) {
		const geometry = new THREE.BoxGeometry(sideLen, sideLen, sideLen);
		const material = new THREE.MeshBasicMaterial({color: hexColor});
		super(geometry, material);
		// this.object = new THREE.Mesh(geometry, material);
		this.geometry.translate(...location);
		this.name = name;
		this.associatedAction = clickHandler;
	}

	setOnClick(clickHandler) {
		this.associatedAction = clickHandler;
	}

	onClick(camera, args) {
		const raycaster = new THREE.Raycaster();
	    const mouse = new THREE.Vector2();
	    raycaster.setFromCamera(mouse, camera);
	    var intersects = raycaster.intersectObjects([this]);
	    if (intersects.length == 1) {
		    console.log("intersects!", this);
		    this.associatedAction(...args);
		}
	}
}

