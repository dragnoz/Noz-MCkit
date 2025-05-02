// webviews/graph/graph.js
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    let cy;

    window.addEventListener("message", (event) => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case "loadGraphData":
                console.log("Received graph data:", message.data);
                renderGraph(message.data);
                break;
        }
    });

    function renderGraph(graphData) {
        if (!graphData || !graphData.nodes || !graphData.edges) {
            console.error("Invalid graph data received");
            return;
        }

        cy = cytoscape({
            container: document.getElementById("cy"), // container to render in

            elements: {
                nodes: graphData.nodes.map(node => ({ data: { id: node.id, label: node.label } })),
                edges: graphData.edges.map(edge => ({ data: { id: `${edge.source}->${edge.target}`, source: edge.source, target: edge.target } }))
            },

            style: [
                // the stylesheet for the graph
                {
                    selector: "node",
                    style: {
                        "background-color": "#666",
                        label: "data(label)",
                        "text-valign": "center",
                        "text-halign": "center",
                        "font-size": "10px",
                        color: "#fff",
                        "text-outline-width": 2,
                        "text-outline-color": "#666",
                        width: "label",
                        height: "label",
                        "padding": "5px"
                    },
                },
                {
                    selector: "edge",
                    style: {
                        width: 1,
                        "line-color": "#ccc",
                        "target-arrow-color": "#ccc",
                        "target-arrow-shape": "triangle",
                        "curve-style": "bezier",
                    },
                },
            ],

            layout: {
                name: "cose", // Cose layout is good for general graphs
                // name: "breadthfirst",
                // directed: true,
                padding: 10,
                animate: false,
            },
        });

        // Add interactivity (Step 004)
        cy.on("tap", "node", function (evt) {
            var node = evt.target;
            const nodeId = node.id();
            console.log("Node tapped:", nodeId);
            // Send message back to the extension
            vscode.postMessage({ command: "nodeClicked", nodeId: nodeId });
        });

        console.log("Graph rendered");
    }

    // Request data once the webview is ready
    console.log("Graph webview requesting data...");
    vscode.postMessage({ command: "getGraphData" });

})();

