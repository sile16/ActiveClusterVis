function updateVisualization(site) {
    cytoscape({
        container: document.getElementById('cy'),
        elements: [
            { data: { id: 'a' } },
            { data: { id: 'b' } },
            { data: { id: 'ab', source: 'a', target: 'b' } }
        ],
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': 'blue'
                }
            },
            {
                selector: 'edge',
                style: {
                    'line-color': 'red'
                }
            }
        ],
        layout: {
            name: 'grid'
        }
    });
    log("updatedTestVisualization");
    log('Container size:', document.getElementById('cy').getBoundingClientRect());
}