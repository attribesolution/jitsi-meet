
function StatsCollector(peerconnection){
    this.peerconnection = peerconnection;
    this.baselineReport = null;
    this.currentReport = null;
    this.intervalId = null;
    // Updates stats every 5 seconds
    this.intervalMilis = 5000;
    // Use SMA 3 to average packet loss changes over times
    this.sma3 = new SimpleMovingAverager(3);
    // Map of jids to PeerStats
    this.jid2stats = {};

    this.start();
}

StatsCollector.prototype.stop = function() {
    if(this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }
};

StatsCollector.prototype.errorCallback = function(error) {
    console.error("Get stats error", error);
    this.stop();
}

StatsCollector.prototype.start = function(){
    var self = this;
    this.intervalId = setInterval(
        function() {
            // Interval updates
            self.peerconnection.getStats(
                function(report){
                    var results = report.result();
                    //console.error("Got interval report", results);
                    self.currentReport = results;
                    self.processReport();
                    self.baselineReport = self.currentReport;
                },
                self.errorCallback
            );
        },
        self.intervalMilis
    );
}

StatsCollector.prototype.processReport = function() {
    if(!this.baselineReport) {
        return;
    }

    for(idx in this.currentReport) {

        var now = this.currentReport[idx];

        if(now.type != 'ssrc') {
            continue;
        }

        var before = this.baselineReport[idx];
        if(!before) {
            console.warn(now.stat('ssrc')+" not enough data");
            continue;
        }

        var key = 'packetsReceived';
        if(!now.stat(key)) {
            key = 'packetsSent';
            if(!now.stat(key)) {
                console.error("No packetsReceived nor packetSent stat found");
                this.stop();
                return;
            }
        }
        var packetsNow = now.stat(key);
        var packetsBefore = before.stat(key);
        var packetRate = packetsNow - packetsBefore;

        var currentLoss = now.stat('packetsLost');
        var previousLoss = before.stat('packetsLost');
        var lossRate = currentLoss - previousLoss;

        var lossPercent = lossRate / (packetRate+lossRate);

        var ssrc = now.stat('ssrc');
        var jid = ssrc2jid[ssrc];
        //console.info(jid+" ssrc: "+ssrc+" loss: "+lossPercent);

        var jidStats = this.jid2stats[jid];
        if(!jidStats){
            jidStats = new PeerStats();
            this.jid2stats[jid] = jidStats;
        }
        jidStats.setSsrcLoss(ssrc, lossPercent);
    }

    var self = this;
    // Jid stats
    var allPeersAvg = 0;
    var jids = Object.keys(this.jid2stats);
    jids.forEach(
        function(jid){

            self.jid2stats[jid].getAvgLoss(
                function(avg){
                    console.info(jid+" stats: "+(avg*100)+" %");
                    allPeersAvg += avg;
                }
            )
        }
    )

    if(jids.length > 1){
        // Our streams loss is reported as 0 always, so -1 to length
        allPeersAvg = allPeersAvg / (jids.length-1);

        /**
         * Calculates number of connection quality bars from 4(hi) to 0(lo).
         */
        var outputAvg = self.sma3(allPeersAvg);
        var quality = Math.round(4 - outputAvg*16); // linear from 4 to 0(25%)
        quality = Math.max(quality, 0); // lower limit 0
        quality = Math.min(quality, 4); // upper limit 4

        console.info("Loss SMA3: " + outputAvg+" Q: "+quality);
    }
};

/**
 * Holds SSRCs loss that belong to some peer.
 * @constructor
 */
function PeerStats(){
    this.ssrc2Loss = {};
}

PeerStats.prototype.setSsrcLoss = function(ssrc, lossRate){
    this.ssrc2Loss[ssrc] = lossRate;
}

PeerStats.prototype.getAvgLoss = function(callback){
    var self = this;
    var avg = 0;
    var count = Object.keys(this.ssrc2Loss).length;
    Object.keys(this.ssrc2Loss).forEach(
        function(ssrc){
            avg += self.ssrc2Loss[ssrc];
        }
    );
    callback(count > 0 ? avg/count : 0);
}

function SimpleMovingAverager(period) {
    var nums = [];
    return function(num) {
        nums.push(num);
        if (nums.length > period)
            nums.splice(0,1);
        var sum = 0;
        for (var i in nums)
            sum += nums[i];
        var n = period;
        if (nums.length < period)
            n = nums.length;
        return(sum/n);
    }
}