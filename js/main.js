var cy = cytoscape({
    container: document.getElementById('cy'),
  
    elements: [
      // nodes
      { data: { id: 'flashArray1' } },
      { data: { id: 'flashArray2' } },
      { data: { id: 'mediator' } },
      { data: { id: 'switch1' } },
      { data: { id: 'switch2' } },
      { data: { id: 'host1' } },
      { data: { id: 'host2' } },
      { data: { id: 'ethernetSwitch1' } },
      { data: { id: 'ethernetSwitch2' } },
  
      // edges
      { data: { id: 'e0', source: 'flashArray1', target: 'mediator' } },
      { data: { id: 'e1', source: 'flashArray2', target: 'mediator' } },
      { data: { id: 'e2', source: 'flashArray1', target: 'switch1' } },
      { data: { id: 'e3', source: 'flashArray2', target: 'switch2' } },
      { data: { id: 'e4', source: 'switch1', target: 'host1' } },
      { data: { id: 'e5', source: 'switch2', target: 'host2' } },
      { data: { id: 'e6', source: 'ethernetSwitch1', target: 'host1' } },
      { data: { id: 'e7', source: 'ethernetSwitch2', target: 'host2' } },
    ],
  
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#666',
          'label': 'data(id)'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 3,
          'line-color': '#ccc',
          'target-arrow-color': '#ccc',
          'target-arrow-shape': 'triangle'
        }
      }
    ],
  
    layout: {
      name: 'grid',
      rows: 3
    }
  });
  