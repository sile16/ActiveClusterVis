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

class ACMessage {
    constructor(podObj, volumeName=null, vmName=null) {
        this.pod = podObj;
        this.volume = volumeName;
        this.vm = vmName;
        this.srcPort = null;
        this.original_packet = null;
    }
}

class Mediator extends NetworkDevice {
    constructor(name = "Cloud Mediator") {
        super(name);
        this.activeArray = null;
        this.ports = [new Port('eth0', this)];
        this.delay = 2;
        this.failoverPreferenceOverride = 5;
        this.mediation_requests = [];
    }
    
    receivePacketFromPort(packet, srcPort) {
        if (packet.message === "ac_mediator_heartbeat") {
            // create new packet to send back
            srcPort.sendResponsePacket(packet, "ac_mediator_heartbeat_ack", packet.data);

        } else if (packet.message === "ac_mediation_request") {
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

    handleAction(action) {
        super.handleAction(action);
        if (action === "fail") {
            this.state = "failed";
        } else if (action === "recover") {
            this.state = "online";
        }
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

class PodArrayStates {
    constructor(array, state) {
        this.array = array;
        this.state = state; // "baselining", "synced", "offline", "re-syncing"
        this.preElected = false;
        this.fa_connected = false;
        this.mediator_connected = false;
        this.elected = false;
        this.state_timers = {};
        this.state_timer_thresholds = {};
        this.state_timer_thresholds["baselining"] = 2;
    }

    incrementTimerisDone() {
        //check if state is in dictionary, and it's a number
        if (!(this.state in this.state_timers) || typeof this.state_timers[this.state] != "number") {
            this.resetStateTimer(this.state);
        }

        this.state_timers[this.state] += 1;
        if ( this.state_timers[this.state] >= this.state_timer_thresholds[this.state]) {
            //delete the timer and return true
            delete this.state_timers[this.state];
            return true;
        }
        return false;
    }

    resetStateTimer() {
        this.state_timers[this.state] = 0;
    }
}




class ActiveClusterPod extends NetworkDevice {
    constructor(name, mediator, mediatorPort) {
        super(name);
        this.mediator = mediator;
        this.mediatorPort = mediatorPort;
        this.volumes = [];
        this.array_states = {};
        this.stetched = false;
        this.failoverPreference = null;
    }



    

    isFowarding(faControllerObj) {
        let array = faControllerObj.fa;
        let otherArray = this.getOtherArray(array.name);

        if (this.array_states[array.name].state === "synced" && this.array_states[otherArray.name].state === "synced") {
            if (this.array_states[array.name].fa_connected && this.array_states[otherArray.name].fa_connected) {
                //shouldn't have to check this but... Let check and log if it happens
                return true;
            }
            else {
                console.log("Array [" + array.name + "] pod [" + this.name + "] is not forwarding because loss of heartbeat with other array");
            }
        }
        return false;
    }
    
    isWriting(faControllerObj) {
        return this.array_states[faControllerObj.fa.name].state === "synced";
    }

    isStretched() {
        // if there are 2 arrays in array_states, then the pod is stretched
        return Object.keys(this.array_states).length > 1;
    }

    ac_write(packet, srcPort, faController) {
        if (this.isFowarding(faController)) {
            let acmessage = new ACMessage(this);
            acmessage.srcPort = srcPort;
            acmessage.original_packet = packet;
            faController.acSendData(this, "ac_write", acmessage);
        } else if (this.isWriting(faController)) {
            srcPort.sendResponsePacket(packet, "write_ack", packet.data);
        }
        //else we do nothing, don't return anything
    }

    isPreferredArray(array) {
        if (this.failoverPreference) {
            return array.name === this.failoverPreference.name;
        }
        return false;
    }

    //add and/or stretch Pod.
    addArray(arrayObj) {
        //check if already in arrays:
        if (arrayObj.name in this.array_states) {
            console.log("Array already in Pod");
            return;
        }
        
        // check lenght of arrays:
        if (Object.keys(this.array_states).length > 1) {
            console.log("Can't stretch Pod, already 2 arrays");
            return;
        }

        // check lenght of arrays:
        if (Object.keys(this.array_states).length == 0) {
            this.array_states[arrayObj.name] = new PodArrayStates(arrayObj, "synced");
            this.array_states[arrayObj.name].preElected = true;
            
        } else {

            this.array_states[arrayObj.name] = new PodArrayStates(arrayObj, "added");
            this.stetched = true;
        }
        //check if pod already in array;
        if (this.name in arrayObj.pods) {
            console.log("Pod already in array");
            return;
        } else {
            arrayObj.pods[this.name] = this;
            
        }
    }

    //unstretch Pod
    removeArray(arrayObj) {
        //check that the array is in dictionary:
        if (!(arrayObj.name in this.array_states)) {
            console.log("Array not in Pod, can't unstretch");
            return;
        }

        //check that there are more than 1 entires is this.arrays:
        if (Object.keys(this.array_states).length <= 1) {
            console.log("Can't unstretch, only 1 array in Pod");
            return;
        }

        //for each volume in the pod check if it's in a hostEntry:
        for (let volume of this.volumes) {
            //check if volume is in a hostEntry:
            for (let hostEntry of arrayObj.hostEntries) {
                if (hostEntry.cotainsVolume(volume)) {
                    console.log("Can't unstretch, volume " + volume.name + " is in a hostEntry");
                    return;
                }
            }
        }

        //remove array from pod:
        delete this.array_states[arrayObj.name];
        delete arrayObj.pods[this.name];
        this.streched = false;
    }

    getOtherArray(arrayName) {
        //this.array is a dictionary, where arrayname is the key and array is the value
        //iterate through this.arrays(dictionary) and return the array that doesn't match array.
        //get keys of this.arrays
        let arrayNames = Object.keys(this.array_states);
        //iterate through arrayNames and return the array that doesn't match arrayName
        for (let name of arrayNames) {
            if (name != arrayName) {
                return this.array_states[name].array;
            }
        }
        
    }

    getOtherArrayStates(arrayName) {
        let otherArray = this.getOtherArray(arrayName);
        if (otherArray) {
            return this.array_states[otherArray.name];
        }
        return null;
    }


    addVolume(volumeName) {
        volumeName = volumeName.toLowerCase();

        //add "podname::" if missing
        if (!volumeName.includes("::")) {
            volumeName = this.name + "::" + volumeName;
        } else {
            let podName = volumeName.split("::")[0];
            if ( podName != this.name ) {
                console.log("Volume name has incorrect pod name");
                return;
            }
        }
        // check if already exists:
        if (volumeName in this.volumes) {
            console.log("Volume already in Pod");
            return;
        }
        //add to volumes
        this.volumes.push(volumeName);
    }

    addFailoverPreference(array) {
        this.failoverPreference = array.name;
    }

    removeFailoverPreference() {
        this.failoverPreference = null;
    }

    isVolumeInPod(volume) {
        //make sure "::" is in name:
        if (!volume.name.includes("::")) {
            console.log("Volume name not in correct format");
            return false;
        }
        let podName = volume.name.split("::")[0];
        
        if (podName != this.name) {
            console.log("Volume is in different pod");
            return false;
        }

        //check if volume is in pod:
        if (!(volume in this.volumes)) {
            console.log("Volume not in pod");
            return false;
        }
        return true;
    }

    isVolumeOnline(volume, array) {
        //volume name in form of "<pod>::<volume>"
        //check array state is synced:
        if (this.isVolumeInPod(volume) && this.array_states[array.name].state != "synced") {
            console.log("Array state not synced");
            return false;
        }
        return true;
    }


    acStep(faController){
        //ActiveCluster
        // for each pod, get the primary controller
        //if the pod is not stretched, then we don't need to do anything
        if (!this.isStretched) {
            return;
          }
    
        let arrayName = faController.fa.name;
        let states = this.array_states[arrayName];
  
        //check for heartbeats
        let acmessage = new ACMessage(this);
        states.fa_connected = false;
        states.mediator_connected = false;
        faController.acSendData(this, "ac_heartbeat", acmessage);
        faController.acSendMed(this, "ac_mediator_heartbeat", acmessage);

        if (states.fa_connected) {
        //because we are connected now, we can look at the other array state to help figure out what to do:
            let otherArrayStates = this.getOtherArrayStates(arrayName)
            if (otherArrayStates.state === "synced") {
                switch(states.state) {
                case "added":
                    states.state = "baselining";
                    states.resetStateTimer();
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;
                case "baselining":
                    if(states.incrementTimerisDone()) {
                        states.state = "synced";
                    }
                    //log
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "offline":
                    states.state = "re-syncing";
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "re-syncing":
                    states.state = "synced";
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "paused":
                    //Othere array is synced, so we go to re-syncing
                    states.state = "re-syncing";
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "synced":
                    //check for pre-election
                    this.preElect(faController);
                }
            } //end of "synced"
            else if (otherArrayStates.state === "paused") {
                switch(states.state) {
                case "paused":
                    // both were paused, i'm the first to bring things online, so i'm in sync
                    pod.array_states[arrayName].state = "synced";
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;
                default:
                    //not sure how we get here, lets log amessage:
                    console.log("Array [" + arrayName + "] is paused, but other array is not paused or synced, so we can't do anything")
                }
            }
        } //end of if (pod_state.fa_connected)  
        else {
            // no fa connection
            switch(states.state) {
                case "synced":
                    if (!states.elected) {
                        if (states.preElected) {
                            states.elected = true;
                            console.log("Array [" + arrayName + "] pod [" + this.name + "] is elected!");
                        } else {
                            states.state = "paused";
                            console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                        }   
                    }
                    break;
                case "paused":
                    //send mediation request
                    let mediation_request = new MediationRequest(this);
                    faController.acSendMed(this, "mediator_request", mediation_request);
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    console.log("Array [" + arrayName + "] pod contactiing Mediator.");
                    break;
                
            }
        }
      }

      preElect(faController) {
        let arrayName = faController.fa.name;
        let states = this.array_states[arrayName];
        let otherArrayStates = this.getOtherArrayStates(arrayName);

        if (!states.mediator_connected && !otherArrayStates.mediator_connected && 
            !otherArrayStates.preElected && !otherArrayStates.elected && 
            !states.preElected && !states.elected) {
            if(this.failoverPreference)
            {
                this.array_states[this.failoverPreference].preElected = true;
                //log event:
                console.log("Array [" + this.failoverPreference + "] pod [" + this.name + "] is pre-elected by Failover Prefeerence");
            } else {
            //pick an array at random:
                let arrayNames = Object.keys(this.array_states);
                let arrayName = arrayNames[Math.floor(Math.random() * arrayNames.length)];
                this.array_states[arrayName].preElected = true;
                console.log("Array [" + this.failoverPreference + "] pod [" + this.name + "] is pre-elected, no Failover Preference set");
            }
        } else {
            //clear preElected flag
            //clear elected flags
            this.clearElections(faController);
        }

        
    }

    clearElections(faController) {
        let arrayName = faController.fa.name;
        let states = this.array_states[arrayName];
        let otherArrayStates = this.getOtherArrayStates(arrayName);
        
        if (this.isFowarding(faController)) {
            //this.array_states is a dictionary, iterate through the objects and clear the preElected and elected flags
            for (let name in this.array_states) {
                let arrayState = this.array_states[name];
                if (arrayState.preElected) {
                    arrayState.preElected = false;
                    //log
                    console.log("Array [" + arrayState.array.name + "] pod [" + this.name + "] is no longer pre-elected");
                }
                if (arrayState.elected) {
                    arrayState.elected = false;
                    //log
                    console.log("Array [" + arrayState.array.name + "] pod [" + this.name + "] is no longer elected");
                }
            }
        }
    }
}

