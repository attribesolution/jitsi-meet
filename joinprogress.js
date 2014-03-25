/**
 * First is getting feedback joining the room:
 * 1/ connect to the xmpp server
 * 2/ allow camera access
 * 3/ join the room
 * There is a break after this since we might be the only person in the room. How about displaying this on the large screen area?
 *
 * The second one is a continuation of this, telling about your connection to the bridge:
 * 4/ receive a session-initiate (or on the focus, allocate a conference)
 * 5/ send a session-accept
 * 6/ end of ice candidates / icegathering state goes to completed
 * 7/ ice connection state change to connected. You want to announce this (through presence)
 * 8/ you get audio (not sure about the best way to check this... probably involves getting the audio track from the stream and checking the time)
 * 9/ you get video
 *
 * @constructor
 */
function JoinProgressListener(){

    /**
     * Stores last progress and filters out multiple notification for the same state
     * (when waiting for participant video in particular).
     * @type {number}
     */
    this.lastProgress = 0;

    /**
     * List of videos that we are still waiting for.
     * @type {Array}
     */
    this.pendingVideos = [];

    // Connect to XMPP phase
    this.s1_connectedToXmpp = function() {
        this.updateJoinProgress(10, "connected to xmpp, getting camera access...");
    }
    this.s1_failedToConnectToXmpp = function(stropheStatus) {
        console.error("Failed to connect to the XMPP, status: "+stropheStatus);
    }

    // Get camera phase
    this.s2_allowedCamera = function() {
        this.updateJoinProgress(20, "have camera access, joining the room...");
    }
    this.s2_getAudioFailed = function(error) {
        console.error("Failed to obtain audio stream", error);
    }
    this.s2_getVideoFailed = function(error) {
        console.warn("Failed to obtain video stream - continue anyway", error);
    }

    // Join the room - detect failure to much complicated(messed code) skipping for now
    this.s3_joinedRoom = function() {
        this.updateJoinProgress(30, "joined the room, joining the conference...");
    }

    // Joining conference
    this.s4_joinedConference = function() {
        this.updateJoinProgress(40, "joined the conference, sending session accept...");
    }
    // We can detect that as a participant when sending accept IQ
    this.s4_failedToJoinConference = function(error) {
        console.error("Failed to join the conference", error)
        connection.emuc.addJoinProgressToPresence(this.lastProgress, 'accept jingle error');
        connection.emuc.sendPresence();
    }

    // Accept jingle session. Don't know how to detect failure at the moment...
    this.s5_sessionAccepted = function() {
        this.updateJoinProgress(50, "session accepted, gathering ice candidates...");
    }

    // Ice negotiations.
    this.s6_gatheredIceCandidates = function() {
        this.updateJoinProgress(60, "got ice candidates, ice negotiations...");
    }
    this.s6_iceFailed = function() {
        console.error("Ice failed");
        connection.emuc.addJoinProgressToPresence(this.lastProgress, 'ice failed');
        connection.emuc.sendPresence();
    }
    this.s7_iceCompleted = function() {
        /**
         * Transition allowed only from ice negotiations phase.
         * It often happens that we have waiting videos added before ICE completes.
         */
        if(this.lastProgress === 60){
            this.updateJoinProgress(70, "ice completed, waiting for media...");
        }
    }

    // State when all pending videos are running
    this.s8_haveAllMedia = function() {
        this.updateJoinProgress(100, "have media");
    }

    // Adds pending video
    this.ensurePendingVideoAdded = function(selector) {
        if(this.pendingVideos.indexOf(selector) == -1) {
            this.pendingVideos.push(selector);
            // Notify waiting for media state(goes back with the progress in some cases here eg. stream switched)
            progressListener.s7_iceCompleted();
        }
    }

    // Remove video from the list on start
    this.ensurePendingVideoRemoved = function(selector) {
        var idx = this.pendingVideos.indexOf(selector);
        if(idx !== -1) {
            this.pendingVideos.splice(idx, 1);
        }
        if(this.pendingVideos.length === 0){
            progressListener.s8_haveAllMedia();
        }
    }
}

JoinProgressListener.prototype.updateJoinProgress = function(percentage, message) {

    if(this.lastProgress != percentage) {

        console.info("PROGRESS: " + percentage + "% m: "+message);
        this.lastProgress = percentage;

        connection.emuc.addJoinProgressToPresence(percentage);
        connection.emuc.sendPresence();
    }
}

$(document).bind('conferencecreated.jingle', function (event) {
    // Focus has created the conference
    progressListener.s4_joinedConference();
});

$(document).bind('peersInvited.jingle', function (event) {
    // Focus has invited other peers
    progressListener.s5_sessionAccepted();
});

$(document).bind('error.jingle', function(event, sid, error) {

    console.error("Jingle error " + sid, error);

    // We've joined the conference as a participant
    if(!focus && error.source === 'answer') {
        progressListener.s4_failedToJoinConference(error);
    }
});

$(document).bind('ack.jingle', function(event, sid, ack) {
    //console.info("Jingle ack "+sid, ack);
});

/**
 *
 * @type {StatsCollector}
 */
var statsCollector = null;

$(document).bind('endgathercandidates.jingle', function (event, session) {
    // Finished gathering candidates
    progressListener.s6_gatheredIceCandidates();

    if(statsCollector) {
        statsCollector.stop();
    }
    statsCollector = new StatsCollector(session.peerconnection);
});

$(document).bind('iceconnectionstatechange.jingle', function(event, sid, session){

    var iceState = session.peerconnection.iceConnectionState;

    console.info("Ice state "+iceState);

    if(iceState === 'connected') {
        // Notify ice completed
        progressListener.s7_iceCompleted();
    } else if(iceState === 'failed') {
        // Notify ice failed
        progressListener.s6_iceFailed();
    }
});