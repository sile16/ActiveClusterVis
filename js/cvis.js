// cvis.js

function getStateColor(state) {
    switch (state) {
        case 'failed':
            return 'red';
        case 'secondary':
            return 'blue';
        case 'running':
            return 'green';
        case 'paused':
        case 'suspended':
            return 'yellow';
        case 'powered_off':
            return 'grey';
        case 'primary':
        case 'online':
        case 'synced':
            return 'green';
        default:
            return 'grey';  // or any other default color
    }
}

function getBezierData(edge) {
    // Replace with the actual path to the Bezier data in the internal structure
    const edgeType = edge._private.rscratch.edgeType; // "straight" or "bezier"
    if (edgeType === 'bezier') {
        const bezierData = edge._private.rscratch.ctrlpts;

        return [{
            x: bezierData[0], // Example, adjust based on actual structure
            y: bezierData[1]  // Example, adjust for quadratic/cubic curves
        }];
        
    }
    return null;
}

function getBezierPosition(t, p0, p1, p2, p3) {
    const cx = 3 * (p1.x - p0.x);
    const bx = 3 * (p2.x - p1.x) - cx;
    const ax = p3.x - p0.x - cx - bx;

    const cy = 3 * (p1.y - p0.y);
    const by = 3 * (p2.y - p1.y) - cy;
    const ay = p3.y - p0.y - cy - by;

    const x = ax * Math.pow(t, 3) + bx * Math.pow(t, 2) + cx * t + p0.x;
    const y = ay * Math.pow(t, 3) + by * Math.pow(t, 2) + cy * t + p0.y;

    return { x, y };
}

function getQuadraticBezierPosition(t, p0, cp, p2) {
    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * cp.x + t * t * p2.x;
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * cp.y + t * t * p2.y;
    return { x, y };
}

function getBezierDerivative(t, p0, cp, p2) {
    return {
        x: 2 * (1 - t) * (cp.x - p0.x) + 2 * t * (p2.x - cp.x),
        y: 2 * (1 - t) * (cp.y - p0.y) + 2 * t * (p2.y - cp.y)
    };
}

function getControlPointRelativePosition(start, control, end) {
    const v1 = { x: control.x - start.x, y: control.y - start.y };
    const v2 = { x: end.x - start.x, y: end.y - start.y };

    // Cross product in 2D
    return v1.x * v2.y - v1.y * v2.x;
}


function getNormalVector(derivative) {
    const length = Math.sqrt(derivative.x * derivative.x + derivative.y * derivative.y);
    return { 
        x: derivative.y / length, 
        y: -derivative.x / length 
    };
}


let currentBalls = [];

function clearBalls() {
    //currentBalls.forEach(ball => ball.remove());
    
    if(cy){
        //console.log("Current balls: ", cy.elements('.ball').length);
        cy.elements('.ball').remove();
        //console.log("Balls after removal: ", cy.elements('.ball').length);
    }

    currentBalls = []; // Reset the array after removing the balls
}

function getBallPosition(edge, torig, offset = 0, reverse = false) {
    const sourcePos = edge.source().position();
    const targetPos = edge.target().position();
    const ballRadius = 3; // Adjusted radius
    let newPos = null;

    let edgeType = edge._private.rscratch.edgeType;
    let ctrlpts = getBezierData(edge);

    // Adjust 't' based on 'reverse' and 'offset'
    let t = reverse ? torig - offset : torig + offset;

    // Make 't' oscillate between 0 and 1
    t = t % 2;
    if (t < 0) t += 2; // Ensure 't' is positive
    if (t > 1) t = 2 - t;

    if (edgeType === 'bezier') {
        const bezierPos = getQuadraticBezierPosition(t, sourcePos, ctrlpts[0], targetPos);
        const derivative = getBezierDerivative(t, sourcePos, ctrlpts[0], targetPos);
        const normal = getNormalVector(derivative);
        const crossProduct = getControlPointRelativePosition(sourcePos, ctrlpts[0], targetPos);
        let shouldNegate = crossProduct < 0;

        if (shouldNegate) {
            normal.x = -normal.x;
            normal.y = -normal.y;
        }

        newPos = {
            x: bezierPos.x + normal.x * ballRadius,
            y: bezierPos.y + normal.y * ballRadius
        };
    } else {
        // Unified linear interpolation
        newPos = {
            x: sourcePos.x + t * (targetPos.x - sourcePos.x),
            y: sourcePos.y + t * (targetPos.y - sourcePos.y)
        };
    }
    
    return newPos;
}


let ballCounter = 0;
function createBall(edgeId, color, offset = 0) {
    const edge = cy.$id(edgeId);

    if (!edge || !edge.source() || !edge.target()) {
        console.error('Can not create ball, Please check the edge ID and its endpoints.');
        return;
    }
    
    

    const startPos = getBallPosition(edge, offset, 0, false)

    const ballId = 'ball-' + Date.now() + ballCounter++ ;

    cy.add({
        group: 'nodes',
        data: { id: ballId,
                color: color,

                offset: offset,
                label: ''
        },
        position: startPos,
        classes: 'ball'
    });

    let ball = cy.$id(ballId);
    currentBalls.push(ball);
    return ball;
}

function resetBallPositions(balls, edge, reverse) {
    balls.forEach(ball => {
        const startPos = reverse ? edge.target().position() : edge.source().position();
        ball.position(startPos);
    });
}



function animateBalls(edgeId, colors) {
    let balls = colors.map((color, index) => createBall(edgeId, color, index * 0.25));
    let reverse = false;

    function animate() {
        const edge = cy.$id(edgeId);
        let startTime = Date.now();
        let duration = 2000;

        function step() {
            let now = Date.now();
            let elapsed = now - startTime;
            let t = elapsed / duration;

            balls.forEach(ball => {

                let newPos;
                let data = ball.data();

                
                newPos = getBallPosition(edge, t, data.offset, reverse);
                
                // Inside your animation step function
                //let newPos = getBezierPosition(t, sourcePos, controlPoint1, controlPoint2, targetPos);

                ball.position(newPos);
            });
            
            requestAnimationFrame(step);

        }

        step();
    }

    animate();
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
    <line x1="0" y1="0" x2="100" y2="100" stroke="red" stroke-width="7"/>
    <line x1="100" y1="0" x2="0" y2="100" stroke="red" stroke-width="7"/>
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
        
        if(obj.currentHostObj){
            elementData.data.parent = obj.currentHostObj.name;
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
        //elementData.data.backgroundImage = "images/vm.jpeg";

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
    let tooltip = document.getElementById('tooltip');
    tooltip.style.display = 'none';
    clearBalls();
    addElementsRecursively(site, elements);
    clearBalls();
    

    for (let connectionName in globalAllConnections) {
        const conn = globalAllConnections[connectionName];
        elements.push({
            data: {
                id: conn.name,
                source: conn.ports[0].device.name,
                target: conn.ports[1].device.name,
                statusColor: getConnColor(conn),
                dataFlowing: conn.dataFlowing
            },
            classes: 'connection'
        });
    }

    const legend_data = {
        'HostIO': 'orange',
        'Replication': 'blue',
        'Mediator': 'brown',
    }

    for (let key in legend_data) {
        elements.push({
            data: {
                id: key,
                label: key,
                color: legend_data[key],
                parent: 'test_site'
            },
            classes: 'legend'
        });
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
                //make edge width dependant if dataFlowing is true
                'width': function(edge) { return edge.data('dataFlowing') ? 5 : 2; },
                'curve-style': 'bezier',
                'control-point-step-size': '60px',
            }
        },
        {
            selector: '.NetworkGroup',
            style: {
                'background-color': 'white',
                'background-fit': 'contain',
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
            selector: '.VM',
            style: {
                
                'shape': 'rectangle',
                'border-width': '2px',
                'border-color': 'black',
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
        },
        {
            selector: '.ball',
            style: {
                'background-color': 'data(color)', // Use a data field for color
                'width': 20,
                'height': 20,
                'shape': 'ellipse',
                //make it so you can't click on interact with the ball
                'events': 'no',
                'z-index': '9999',
            }
        },
        {
            selector: '.legend',
            style: {
                'background-color': 'data(color)', // Use a data field for color
                'width': 30,
                'height': 30,
                'shape': 'ellipse',
                //make it so you can't click on interact with the ball
                //'events': 'no',
                //'z-index': '9999',
            }
        }
    ];
    
    if (!cy) {
        cy = cytoscape({
           container: document.getElementById('cy'),
           //wheelSensitivity: 0.2, // Adjust this value for your needs
           minZoom: 0.5,          // Adjust this value for your needs
           maxZoom: 10,           // Adjust this value for your needs
           elements: elements,
           style: style,
           layout: {
            name: 'preset',
            //idealEdgeLength: 100, // Adjust this value for your needs
            positions: savedPositions,      // Adjust this value for your needs
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

       cy.on('mouseover', 'node', function(event){
        let tooltip = document.getElementById('tooltip');
        let node = event.target;
        if (node.hasClass('Site') || node.hasClass('MultiSite')) {
            return;
        }

        if (event) {
            let nodeId = event.target.id();
            let node = allObjects[nodeId];
            
            if(node && node.jsonStatus) {
                tooltip.style.left = event.renderedPosition.x + 'px';
                tooltip.style.top = event.renderedPosition.y + 'px';
                 tooltip.style.display = 'block';
                let tooltipContent = 'Node: ' + node.name + '<br>'

                let jsonInfo = node.jsonStatus();
                for (let key in jsonInfo) {
                    tooltipContent += key + ': ' + jsonInfo[key] + '<br>';
                }
                tooltip.innerHTML = tooltipContent; // Customize this
            }
            

        } else {
            tooltip.style.display = 'none';
        }
       });

   
       cy.on('tap', 'edge', function(evt){
           const edgeId = evt.target.id();
           const eventName = document.getElementById('events').value;
           handleEdgeClick(edgeId, eventName);
       });

       cy.on('mouseover', 'edge', function(event) {
        let tooltip = document.getElementById('tooltip');
        if (event) {
            
            //see if edge id in globalAllConnections
            //if so, get data_types
            //loop through data_types and add to tooltip
            let edgeId = event.target.id();
            let edge = globalAllConnections[edgeId];
            
            if(edge) {
                tooltip.style.left = event.renderedPosition.x + 'px';
                tooltip.style.top = event.renderedPosition.y + 'px';
                tooltip.style.display = 'block';
            
                let tooltipContent = 'Connection: ' + event.target.id() + "<br> state:" + edge.state + '<br>';
                tooltipContent += '<br>Data Types Flowing: <br>';
                for (let key in edge.data_types) {
                    tooltipContent += key + '<br>';
                }
                tooltip.innerHTML = tooltipContent; // Customize this
            }

        } else {
            tooltip.style.display = 'none';
        }
        });

       cy.on('mouseout', 'edge', function(event) {
        let tooltip = document.getElementById('tooltip');
        tooltip.style.display = 'none';
       });
       cy.on('mouseout', 'node', function(event) {
        let tooltip = document.getElementById('tooltip');
        tooltip.style.display = 'none';
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

       for (let connectionName in globalAllConnections) {
        const conn = globalAllConnections[connectionName];
        
        if (conn.dataFlowing) {
            //pulseEdge(conn.name);
            //todo: get list of colors from the connection
            
            colors = [];
            //loop through all keys in conn.data_types
            //if key is in conn.data_types, add color to colors
            for (let key in conn.data_types) {
                if (key === 'replication') {
                    colors.push('blue');
                }
                else if (key.includes('read')) {
                    //colors.push('brown');
                }
                else if (key.includes('write')) {
                    colors.push('orange');
                }
                else if('mediator' === key) {
                    colors.push('brown');
                }
                else {
                    colors.push('red');
                }
            }
            

            if (colors.length === 0) {
                colors.push('red');
            }
            animateBalls(conn.name, colors);
        } 
       }
    }
}



function handleNodeClick(nodeId, eventName) {
    

    //check if node exists in allObjects
    if (!allObjects[nodeId]) {
        return;
    }

    if(allObjects[nodeId].handleAction) {
        allObjects[nodeId].handleAction(eventName);
        log('Action: Node ' + nodeId + ' ' + eventName);

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

        //check if id "clickstep"  is checked. 
        //if so, call step on all objects
        if(document.getElementById('clickstep').checked) {
            step();
        }

    } else {
        log('Invalid node or event');
    }
}

function handleEdgeClick(edgeId, eventName) {
    globalAllConnections[edgeId].handleAction(eventName);
    log('Action: Edge ' + edgeId + ' ' + eventName);
    if(document.getElementById('clickstep').checked) {
        step();
    }
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


let savedPositions = {
    "test_site": {
        "x": 1476.701876990655,
        "y": 639.0834079771087
    },
    "site1": {
        "x": 1051.6310592229156,
        "y": 678.8830921910737
    },
    "site1fa1": {
        "x": 933.9872980297763,
        "y": 747.8240571376297
    },
    "site1fa1-ct0": {
        "x": 806.8180232913967,
        "y": 677.7198762172462
    },
    "site1fa1-ct1": {
        "x": 1061.156572768156,
        "y": 817.9282380580131
    },
    "site1_vmware": {
        "x": 952.7848529647274,
        "y": 428.38680542549116
    },
    "site1vmhost": {
        "x": 900.9689383623569,
        "y": 389.8470668885086
    },
    "site1fcswitcha": {
        "x": 1060.9426187346155,
        "y": 441.9021058655195
    },
    "site1fcswitchb": {
        "x": 845.1270871948394,
        "y": 503.92654396247366
    },
    "site1_mgmtsw": {
        "x": 987.243933521738,
        "y": 968.2088909556157
    },
    "site1mgmtswitch1": {
        "x": 882.8737570923367,
        "y": 1021.4191174936389
    },
    "site1mgmtswitch2": {
        "x": 1091.6141099511392,
        "y": 931.9986644175926
    },
    "site1_replicationsw": {
        "x": 1264.7233285996804,
        "y": 745.9253706621414
    },
    "site1replicationswitch1": {
        "x": 1265.4440951544345,
        "y": 690.1197929970579
    },
    "site1replicationswitch2": {
        "x": 1264.002562044926,
        "y": 818.7309483272248
    },
    "site2": {
        "x": 1870.3697970902408,
        "y": 683.4076232362688
    },
    "site2fa1": {
        "x": 1997.0044223325099,
        "y": 746.6614036067643
    },
    "site2fa1-ct0": {
        "x": 2146.5857306899134,
        "y": 677.2934652299181
    },
    "site2fa1-ct1": {
        "x": 1847.4231139751066,
        "y": 816.0293419836106
    },
    "site2_vmware": {
        "x": 1950.9600402757303,
        "y": 431.8555578833177
    },
    "site2vmhost": {
        "x": 1987.339163248204,
        "y": 386.8686670853169
    },
    "site2fcswitcha": {
        "x": 1799.0873687511903,
        "y": 438.947225119146
    },
    "site2fcswitchb": {
        "x": 2102.3327118002703,
        "y": 498.8424486813186
    },
    "site2_mgmtsw": {
        "x": 1892.7851010616005,
        "y": 966.2998529283375
    },
    "site2mgmtswitch1": {
        "x": 1982.6947785688415,
        "y": 1018.4465793872207
    },
    "site2mgmtswitch2": {
        "x": 1802.8754235543595,
        "y": 931.1531264694542
    },
    "site2_replicationsw": {
        "x": 1625.8173146674078,
        "y": 744.3827738309586
    },
    "site2replicationswitch1": {
        "x": 1625.153863490568,
        "y": 688.4180825708204
    },
    "site2replicationswitch2": {
        "x": 1626.4807658442476,
        "y": 817.3474650910969
    },
    "site3": {
        "x": 1444.825933161692,
        "y": 959.0577234625686
    },
    "cloud_mediator": {
        "x": 1444.825933161692,
        "y": 1015.2602203891083
    },
    "cloudswitch": {
        "x": 1445.6493921316835,
        "y": 904.8552265360288
    },
    "activecluster_pods": {
        "x": 1586.4574894416983,
        "y": 270.2476984605785
    },
    "pod1": {
        "x": 1586.4574894416983,
        "y": 278.7476984605785
    },
    "powered_off_vms": {
        "x": 1183.8955015244844,
        "y": 256.8330040959406
    },
    "podvm1": {
        "x": 1183.8955015244844,
        "y": 256.8330040959406
    },
    "HostIO": {
        "x": 802.9146003173914,
        "y": 259.05711811035155
    },
    "Replication": {
        "x": 905.5225558574343,
        "y": 257.10280328614397
    },
    "Mediator": {
        "x": 1000.3306509783943,
        "y": 258.22098971992443
    }
}