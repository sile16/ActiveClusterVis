// cvis.js

function getStateColor(state) {
    switch (state) {
        case 'failed':
            return 'red';
        case 'secondary':
            return 'blue';
        default:
            return 'green';  // or any other default color
    }
}

const edgeBaseStyle = {
    'curve-style': 'bezier',
    'width': 3,
    'line-color': '#888',
    'opacity': 0.5
};

function pulseEdge(edgeId) {
    const edge = cy.$id(edgeId);
    let growing = true;
    const max_width = 5;
    const min_width = 3;
    
    function animate() {
        if (growing) {
            edge.animate({
                style: { 'width': max_width },
                duration: 300,
                easing: 'ease-in-out',
                complete: animate  // callback for continuous animation
            });
        } else {
            edge.animate({
                style: { 'width': min_width },
                duration: 300,
                easing: 'ease-in-out',
                complete: animate  // callback for continuous animation
            });
        }
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

function addElementsRecursively(obj, elements) {
    let elementData = {
        data: { 
            id: obj.name, 
            label: obj.name,
            parent: obj.parent.name,
            textColor: getStateColor(obj.state)
        },
        classes: obj.constructor.name
    };
    allObjects[obj.name] = obj;

    if (obj.constructor.name === 'VM') {
        // If this object is a VM, set its parent to its associated VMHost
        if(obj.currentHost){
            elementData.data.parent = obj.currentHost.name;
        } else {
            elementData.data.parent = null;
        }
        elementData.data.backgroundImage = "vm.jpeg";

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
            }
        }
    }

    if (!cy) {
        cy = cytoscape({
           container: document.getElementById('cy'),
           elements: elements,
           style: [
               {
                   selector: 'node',
                   style: {
                       'label': 'data(label)',
                       'background-image': function(node) {
                           let backgroundImage = node.data('backgroundImage');
                           if (backgroundImage) {
                               if (node.data('crossedOut')) {
                                   return [redXDataURL, backgroundImage];
                               } else {
                                   return [backgroundImage];
                               }
                           } else {
                               return [];
                           }
                       },
                       'background-fit': 'cover cover'
                   }
               },
               {
                   selector: 'edge',
                   style: {
                       'line-color': 'data(statusColor)',  // Changed lineColor to statusColor
                   }
               },
               {
                   selector: 'node[?crossedOut]',
                   style: {
                       'background-image': [redXDataURL, '/path/to/your/existing/background.png'],
                       'background-fit': ['cover', 'cover'],
                   }
               }
           ],
           layout: {
               name: 'cose',
               nestingFactor: 1.2,
           }
       });

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
       cy.json({ elements: elements });
    }
}


function handleNodeClick(nodeId, eventName) {
    if(allObjects[nodeId] && allObjects[nodeId].handleAction) {
        allObjects[nodeId].handleAction(eventName);
        console.log(`${nodeId} handled event: ${eventName}`);
    } else {
        console.log('Invalid node or event');
    }
}

function handleEdgeClick(edgeId, eventName) {
    if(globalAllConnections[edgeId] && globalAllConnections[edgeId].handleAction) {
        globalAllConnections[edgeId].handleAction(eventName);
        console.log(`${edgeId} handled event: ${eventName}`);
    } else {
        console.log('Invalid edge or event');
    }
}
