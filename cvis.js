// cvis.js

function getStateColor(state) {
    switch (state) {
        case 'failed':
            return 'red';
        case 'secondary':
            return 'blue';
        case 'primary':
        case 'online':
            return 'green';
        default:
            return 'grey';  // or any other default color
    }
}




function pulseEdge(edgeId) {
    const edge = cy.$id(edgeId);
    let growing = true;
    const max_width = 6;
    const min_width = 4;
    
    function animate() {
        const width = growing ? max_width : min_width;
        
        edge.animate({
            style: { 'width': width },
            duration: 300,
            easing: 'ease-in-out',
            complete: animate  // callback for continuous animation
        });
        growing = !growing;
    }
    
    animate();  // start the animation
}

function getConnColor(conn) {
    if (conn.isOnline()) {
        return conn.dataFlowing ? 'black' : 'grey';  // assuming black for true, grey for false
    } else {
        return 'red';
    }
}

let cy;

const redXSVG = `
  <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="0" x2="100" y2="100" stroke="red" stroke-width="2"/>
    <line x1="100" y1="0" x2="0" y2="100" stroke="red" stroke-width="2"/>
  </svg>
`;

const redXDataURL = 'data:image/svg+xml;base64,' + btoa(redXSVG);
let allObjects = {};
let parentChanges = [];

function addElementsRecursively(obj, elements) {
    let elementData = {
        data: { 
            id: obj.name, 
            label: obj.label ? obj.label : obj.name,
            parent: obj.parent.name,
            textColor: getStateColor(obj.state),
            bgColor: getStateColor(obj.state)
        },
        classes: obj.constructor.name
    };
    allObjects[obj.name] = obj;

    


    if (obj.constructor.name === 'VM') {
        // If this object is a VM, set its parent to its associated VMHost
        
        if(obj.currentHost){
            elementData.data.parent = obj.currentHost.name;
        } else {
            elementData.data.parent = site.poweredOffVMsGroup.name;
        }


        if(cy){
            let currParent = cy.getElementById(obj.name).parent().id();
            if(currParent !== elementData.data.parent) {

                parentChanges.push({
                    child: obj.name,
                    newParent: elementData.data.parent
                });
            }
        }
        elementData.data.backgroundImage = "images/vm.jpeg";

    } else if (obj.constructor.name === 'Mediator') {
        elementData.data.backgroundImage = "images/cloud.png";
    } else if(obj.constructor.name === 'Switch') {
        elementData.data.backgroundImage = "images/switch.png";
    } else if(obj.constructor.name === 'NetworkGroup' && obj.name.includes('vmware')) {
        elementData.data.backgroundImage = "images/vmhost.jpeg";
    } else if(obj.constructor.name === 'FlashArray') {
        elementData.data.backgroundImage = "images/pure.png";
    }

    elements.push(elementData);

    if (obj.children && obj.children.length > 0) {
        for (const child of obj.children) {
            addElementsRecursively(child, elements);
        }
    }


}

function updateVisualization(site) {
    const elements = [];
    parentChanges = [];
    addElementsRecursively(site, elements);
    

    for (let connectionName in globalAllConnections) {
        const conn = globalAllConnections[connectionName];
        elements.push({
            data: {
                id: conn.name,
                source: conn.ports[0].device.name,
                target: conn.ports[1].device.name,
                statusColor: getConnColor(conn)
            },
            classes: 'connection'
        });

        if (conn.dataFlowing) {
            pulseEdge(conn.name);
        } else {
            if(cy){
                cy.$id(conn.name).stop(true);
                //set edget width to 2px   
                cy.$id(conn.name).style('width', '2px');
            }
        }
    }

    let style = [
        {
            selector: 'node',
            style: {
                'label': 'data(label)',
                'background-color': 'data(bgColor)',
                'background-image': function(node) {
                    let backgroundImage = node.data('backgroundImage');
                    if (node.data('crossedOut')) {
                        return backgroundImage ? [backgroundImage, redXDataURL] : [redXDataURL];
                    } else {
                        return backgroundImage ? [backgroundImage] : [];
                    }
                },
                'background-fit': 'cover cover'
                
            }
        },
        
        {
            selector: 'edge',
            style: {
                'line-color': 'data(statusColor)',  // Changed lineColor to statusColor
                'width': '2px',
            }
        },
        {
            selector: '.NetworkGroup',
            style: {
                'background-color': 'white',
                'background-image-fit': 'contain',
                'background-image-opacity': '0.15',
            }
        },
        {
            selector: '.Site',
            style: {
                'background-color': 'white'
            }
        },
        {
            selector: '.CloudSite',
            style: {
                'background-color': 'white'
            }
        },
        {
            selector: '.Mediator',
            style: {
                'width': '60px',
                'height': '60px'
            }
        },
        {
            selector: '.MultiSite',
            style: {
                'background-color': 'white'
            }
        },
        {
            selector: '.FlashArray',
            style: {
                'background-color': 'white',
                'background-image-opacity': '0.2',
                'background-fit': 'contain'
            }
        },
        {
            selector: '.FlashArrayController',
            style: {
                'shape': 'rectangle',
                'z-compound-depth': 'top',
                'z-index': '9999',
                'background-color': 'white',
                //set backgroun opacity
                //'background-opacity': '0.2',
                'border-width': '4px',
                'border-color': 'data(textColor)',
                'text-valign': 'center',
                'text-halign': 'center',
                'color': 'data(textColor)',
                'width': '100px',
                'height': '40px',
                //set label text color
                //'label-color': 'data(textColor)',
            }
        },
        
        {
            selector: '.VMHost',
            style: {
                'background-color': 'white',
                
                'shape': 'rectangle',
                'border-width': '2px',
                'border-color': 'black',
                'width': '150px',
                'height': '40px',
            }
        },
        {
            selector: '.Switch',
            style: {
                width: '80px',
                shape: 'rectangle',
            }
        }
    ];
    
    if (!cy) {
        cy = cytoscape({
           container: document.getElementById('cy'),
           elements: elements,
           style: style,
           layout: {
            name: 'preset',
            //idealEdgeLength: 100, // Adjust this value for your needs
            positions: savedPositions      // Adjust this value for your needs
            //refresh: 20,
            //fit: true,
            //padding: 40,
            //randomize: false,
            //nestingFactor: 0,
            //gravity: 100,          // Adjust this value for your needs
            
        }});

        /*
        cy.nodes().forEach(node => {
            const layoutInfo = node.data('layout');
            if (layoutInfo) {
                // Here, you could run specific layout algorithms based on layoutInfo
                // For instance:
                
                node.children().layout(layoutInfo).run();
                // Add more conditions for other layouts as needed
            }
        }); */



       cy.on('tap', 'node', function(evt){
           const nodeId = evt.target.id();
           const eventName = document.getElementById('events').value;
           handleNodeClick(nodeId, eventName);
       });
   
       cy.on('tap', 'edge', function(evt){
           const edgeId = evt.target.id();
           const eventName = document.getElementById('events').value;
           handleEdgeClick(edgeId, eventName);
       });
    } else {
        parentChanges.forEach(change => {
            let childNode = cy.getElementById(change.child);
            let parentNode = cy.getElementById(change.newParent);
            const originalParentPosition = parentNode.position();

            childNode.position(originalParentPosition);
            
            childNode.move({ parent: parentNode.id() });
            parentNode.position(originalParentPosition);
            layoutChildrenInGrid(parentNode);
        });
        parentChanges = {};

       cy.json({ elements: elements });
       cy.json({ style: style });
       cy.style().update();
    }
}


function handleNodeClick(nodeId, eventName) {
    

    //check if node exists in allObjects
    if (!allObjects[nodeId]) {
        return;
    }

    if(allObjects[nodeId].handleAction) {
        allObjects[nodeId].handleAction(eventName);

        //check all nodes in allObjects and set crossedOut to true if failed

        for( let node in allObjects) {

            let nodesToCrossOut = cy.$('#'+node);
            if (allObjects[node].state === 'failed') {
                // get nodes by IDs
                nodesToCrossOut.data('crossedOut', true);
            }
            else {
                nodesToCrossOut.removeData('crossedOut');
            }
            cy.style().update();
        }
    } else {
        console.log('Invalid node or event');
    }
}

function handleEdgeClick(edgeId, eventName) {
    globalAllConnections[edgeId].handleAction(eventName);
}

function adjustParentBoundingBox(parent) {
    let childrenBoundingBox = parent.children().boundingBox();

    let newWidth = Math.max(childrenBoundingBox.w, parent.width());
    let newHeight = Math.max(childrenBoundingBox.h, parent.height());

    parent.style({
        'width': newWidth + 'px',
        'height': newHeight + 'px'
    });
}


function layoutChildrenInGrid(parent) {
    parent.lock();

    const originalPosition = {
        x: parent.position('x'),
        y: parent.position('y')
    };

    // 1. Get the initial bounding box center of the children
    let initialChildrenCenter = {
        x: (parent.children().boundingBox().x1 + parent.children().boundingBox().x2) / 2,
        y: (parent.children().boundingBox().y1 + parent.children().boundingBox().y2) / 2
    };

    // 2. Apply the grid layout to the children
    let children = parent.children();
    children.layout({
        name: 'grid',
        fit: false,
        boundingBox: parent.boundingBox(),
        avoidOverlap: true,
        spacingFactor: 1.05,
        cols: undefined
    }).run();

    // 3. Calculate the shift in the bounding box center of the children due to the layout
    let newChildrenCenter = {
        x: (parent.children().boundingBox().x1 + parent.children().boundingBox().x2) / 2,
        y: (parent.children().boundingBox().y1 + parent.children().boundingBox().y2) / 2
    };

    let diffX = newChildrenCenter.x - initialChildrenCenter.x;
    let diffY = newChildrenCenter.y - initialChildrenCenter.y;

    // 4. Adjust the positions of the children nodes accordingly
    children.positions(function(node) {
        return {
            x: node.position('x') - diffX,
            y: node.position('y') - diffY
        };
    });

    adjustParentBoundingBox(parent);

    // 5. Set the position of the parent to its original position
    parent.position(originalPosition);
    parent.unlock();
}





let savedPositions = {"test_site":{"x":2004.7099632227403,"y":856.5177729010808},"powered_off_vms":{"x":1516.4533849129518,"y":1288.467343021004},"podvm1":{"x":1418.8357725982742,"y":1294.7467460996734},"site1":{"x":1620.3017954223433,"y":769.6900762278281},"site1fa1":{"x":1425.703075038387,"y":804.3117609924608},"site1fa1-ct0":{"x":1325.2624178496962,"y":746.6382591235024},"site1fa1-ct1":{"x":1526.1437322270779,"y":878.9852628614192},"site1_vmware":{"x":1447.359037404193,"y":534.0308552094407},"site1vmhost":{"x":1411.5519748178062,"y":457.47046196849584},"site1fcswitcha":{"x":1363.9858012748384,"y":543.8381928037437},"site1fcswitchb":{"x":1530.2322735335476,"y":632.5912484503855},"site1_mgmtsw":{"x":1519.8387726651665,"y":1107.879496787516},"site1mgmtswitch1":{"x":1391.8845219272166,"y":1112.349303087872},"site1mgmtswitch2":{"x":1647.7930234031164,"y":1120.40969048716},"site1_replicationsw":{"x":1875.3358939134978,"y":806.9823954655474},"site1replicationswitch1":{"x":1876.3411729949905,"y":750.7485584656545},"site1replicationswitch2":{"x":1874.330614832005,"y":880.2162324654403},"site1vm1":{"x":1509.982640329001,"y":1294.7467460996731},"site2":{"x":2379.3949633316074,"y":759.4012284350898},"site2fa1":{"x":2538.399445465353,"y":800.0045642204557},"site2fa1-ct0":{"x":2673.0441734273422,"y":736.7782184127547},"site2fa1-ct1":{"x":2403.7547175033637,"y":880.2309100281566},"site2_vmware":{"x":2594.937957276395,"y":512.5659779438485},"site2vmhost":{"x":2652.1575085957843,"y":436.91979054473467},"site2fcswitcha":{"x":2514.218405957006,"y":525.1605958516717},"site2fcswitchb":{"x":2652.375228846249,"y":610.2121653429622},"site2_mgmtsw":{"x":2445.972161348718,"y":1110.6872736219486},"site2mgmtswitch1":{"x":2298.4688241499043,"y":1120.382666325445},"site2mgmtswitch2":{"x":2593.4754985475315,"y":1117.9918809184524},"site2_replicationsw":{"x":2116.8996459420155,"y":802.2952553932255},"site2replicationswitch1":{"x":2120.1668738166004,"y":749.4751073742274},"site2replicationswitch2":{"x":2113.6324180674305,"y":872.1154034122236},"site2vm1":{"x":1611.0709972276295,"y":1299.1879399423347},"site3":{"x":1993.8674772848008,"y":1278.9132583308874},"cloud_mediator":{"x":1993.8674772848005,"y":1342.6157552574268},"cloudswitch":{"x":1994.6909362547922,"y":1232.2107614043477},"activecluster_posd":{"x":2432.935600117573,"y":1276.5789521471916},"pod1":{"x":2432.935600117573,"y":1285.0789521471916}};