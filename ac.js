class MediationRequest {
    //podName, array1 time since request, array2 time since request,
    constructor(podName, array1, array2, failoverPreference=null) {
        this.podName = podName;
        this.array1 = array1;
        this.array2 = array2;
        this.timeSinceRequest = 0;
        this.failoverPreference = failoverPreference;
    }
        
}

class Mediator {
    constructor() {
        this.name = "Cloud Mediator";
        this.activeArray = null;
        this.port = new Port('eth0', this);
        this.delay = 2;
        this.failoverPreferenceOverride = 5;
        this.mediation_requests = [];

    }
    
    receivePacket(packet, srcPort) {
        if (packet.message === "heartbeat") {
            // create new packet to send back
            let responsePacket = new Packet(this.name, this.port, packet.src, packet.srcPort, 'heartbeat_ack', {});
            this.port.sendPacket(responsePacket);

        } else if (packet.message === "mediation_request") {
            //first check if there is an existing mediation
            let existingRequest = this.mediation_requests.find(r => r.podName === packet.src);
            
            // if there is an existing request update the array response
            if (existingRequest) {
                if (packet.srcPort === existingRequest.array1) {
                    existingRequest.array1 = packet.data.array1;
                } else if (packet.srcPort === existingRequest.array2) {
                    existingRequest.array2 = packet.data.array2;
                }
            } else {
                //create a decision request
                let request = new MediationRequest(packet.src, packet.data.array1, packet.data.array2, packet.data.failoverPreference);
                this.mediation_requests.push(request);
            }
        }
    }

    sendPacket(packet) {
        // Implement packet sending
    }

    step() {
        //go through all mediation requests, increment the time since request and responsd if time thresholds met:
        for (let request of this.mediation_requests) {
            request.timeSinceRequest += 1;
            if (request.timeSinceRequest > this.delay) {
                // if the array requesting is the preferred array, send back a response with the active array set to true
                // otherwise if it's the non-preferred array wait until this.failoverPreferenceOverride and then send back a response

                let responsePacket = new Packet(this.name, this.port, request.podName, request.array1, request.array2, decision);
                this.port.sendPacket(responsePacket);

                //afterwards delete the request
                this.mediation_requests.splice(this.mediation_requests.indexOf(request), 1);

            }
        }
    }
}

class ActiveClusterPod extends NetworkDevice {
    constructor(name, flashArrays) {
        super();
        this.name = name;
        this.flashArrays = flashArrays;
        this.ready = "online";
        this.mediator = new Mediator();
    }

    sendHeartbeat() {
        let heartbeatPacket = new Packet(this, 'heartbeat', this.mediator, 'mediator_heartbeat_port', {});
        // Assume sendPacket is a method to send packets
        this.sendPacket(heartbeatPacket);  
    }

    requestDecision() {
        let decisionRequestPacket = new Packet(this, 'decision_request', this.mediator, 'mediator_decision_port', {failoverPreference: 'your_preference'});
        this.sendPacket(decisionRequestPacket);
    }

    receivePacket(packet) {
        if(packet.message === 'mediator_decision') {
            this.ready = packet.data.activeArray ? "online" : "offline";
        }
        super.receivePacket(packet);  // Call the parent class's receivePacket method
    }
    
    sendPacket(packet) {
        // Implement packet sending
    }
}
