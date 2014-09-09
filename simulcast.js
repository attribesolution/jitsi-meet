/*jslint plusplus: true */
/*jslint nomen: true*/

/**
 * Created by gp on 11/08/14.
 */
function Simulcast() {
    "use strict";

    // TODO(gp) split the Simulcast class in two classes : NativeSimulcast and ClassicSimulcast.
    this.useNativeSimulcast = false;
    this.enabled = true;
    this.debugLvl = 1;
}

(function () {
    "use strict";
    // global state for all transformers.
    var localExplosionMap = {}, localVideoSourceCache, emptyCompoundIndex,
        remoteMaps = {
            msid2Quality: {},
            ssrc2Msid: {}
        }, localMaps = {
            msids: [],
            msid2ssrc: {}
        };

    Simulcast.prototype._generateGuid = (function () {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        return function () {
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        };
    }());

    Simulcast.prototype._cacheVideoSources = function (lines) {
        localVideoSourceCache = this._getVideoSources(lines);
    };

    Simulcast.prototype._restoreVideoSources = function (lines) {
        this._replaceVideoSources(lines, localVideoSourceCache);
    };

    Simulcast.prototype._replaceVideoSources = function (lines, videoSources) {

        var i, inVideo = false, index = -1, howMany = 0;

        if (this.debugLvl) {
            console.info('Replacing video sources...');
        }

        for (i = 0; i < lines.length; i++) {
            if (inVideo && lines[i].substring(0, 'm='.length) === 'm=') {
                // Out of video.
                break;
            }

            if (!inVideo && lines[i].substring(0, 'm=video '.length) === 'm=video ') {
                // In video.
                inVideo = true;
            }

            if (inVideo && (lines[i].substring(0, 'a=ssrc:'.length) === 'a=ssrc:'
                    || lines[i].substring(0, 'a=ssrc-group:'.length) === 'a=ssrc-group:')) {

                if (index === -1) {
                    index = i;
                }

                howMany++;
            }
        }

        //  efficiency baby ;)
        lines.splice.apply(lines,
            [index, howMany].concat(videoSources));

    };

    Simulcast.prototype._getVideoSources = function (lines) {
        var i, inVideo = false, sb = [];

        if (this.debugLvl) {
            console.info('Getting video sources...');
        }

        for (i = 0; i < lines.length; i++) {
            if (inVideo && lines[i].substring(0, 'm='.length) === 'm=') {
                // Out of video.
                break;
            }

            if (!inVideo && lines[i].substring(0, 'm=video '.length) === 'm=video ') {
                // In video.
                inVideo = true;
            }

            if (inVideo && lines[i].substring(0, 'a=ssrc:'.length) === 'a=ssrc:') {
                // In SSRC.
                sb.push(lines[i]);
            }

            if (inVideo && lines[i].substring(0, 'a=ssrc-group:'.length) === 'a=ssrc-group:') {
                sb.push(lines[i]);
            }
        }

        return sb;
    };

    Simulcast.prototype._parseMedia = function (lines, mediatypes) {
        var i, res = [], type, cur_media, idx, ssrcs, cur_ssrc, ssrc,
            ssrc_attribute, group, semantics, skip;

        if (this.debugLvl) {
            console.info('Parsing media sources...');
        }

        for (i = 0; i < lines.length; i++) {
            if (lines[i].substring(0, 'm='.length) === 'm=') {

                type = lines[i]
                    .substr('m='.length, lines[i].indexOf(' ') - 'm='.length);
                skip = mediatypes !== undefined && mediatypes.indexOf(type) === -1;

                if (!skip) {
                    cur_media = {
                        'type': type,
                        'sources': {},
                        'groups': [],
                    };

                    res.push(cur_media);
                }

            } else if (!skip && lines[i].substring(0, 'a=ssrc:'.length) === 'a=ssrc:') {

                idx = lines[i].indexOf(' ');
                ssrc = lines[i].substring('a=ssrc:'.length, idx);
                if (cur_media.sources[ssrc] === undefined) {
                    cur_ssrc = {'ssrc': ssrc};
                    cur_media.sources[ssrc] = cur_ssrc;
                }

                ssrc_attribute = lines[i].substr(idx + 1).split(':', 2)[0];
                cur_ssrc[ssrc_attribute] = lines[i].substr(idx + 1).split(':', 2)[1];

                if (cur_media.base === undefined) {
                    cur_media.base = cur_ssrc;
                }

            } else if (!skip && lines[i].substring(0, 'a=ssrc-group:'.length) === 'a=ssrc-group:') {
                idx = lines[i].indexOf(' ');
                semantics = lines[i].substr(0, idx).substr('a=ssrc-group:'.length);
                ssrcs = lines[i].substr(idx).trim().split(' ');
                group = {
                    'semantics': semantics,
                    'ssrcs': ssrcs
                };
                cur_media.groups.push(group);
            } else if (!skip && (lines[i].substring(0, 'a=sendrecv'.length) === 'a=sendrecv' ||
                                    lines[i].substring(0, 'a=recvonly'.length) === 'a=recvonly' ||
                                    lines[i].substring(0, 'a=sendonly'.length) === 'a=sendonly' ||
                                    lines[i].substring(0, 'a=inactive'.length) === 'a=inactive')) {

                cur_media.direction = lines[i].substring('a='.length, 8);
            }
        }

        return res;
    };

    // Returns a random integer between min (included) and max (excluded)
    // Using Math.round() will give you a non-uniform distribution!
    Simulcast.prototype._generateRandomSSRC = function () {
        var min = 0, max = 0xffffffff;
        return Math.floor(Math.random() * (max - min)) + min;
    };

    Simulcast.prototype._disableBundle = function (desc) {
        if (desc.type === 'offer') {
            desc.sdp = desc.sdp.replace(/a=group:BUNDLE audio video\r\n/g, '');
        }
    };

    Simulcast.prototype._disableRTCPMux = function (desc) {
        if (desc.type === 'offer') {
            desc.sdp = desc.sdp.replace(/a=rtcp-mux\r\n/g, '');
        }
    };

    function CompoundIndex(obj) {
        if (obj !== undefined) {
            this.row = obj.row;
            this.column = obj.column;
        }
    }

    emptyCompoundIndex = new CompoundIndex();

    Simulcast.prototype._indexOfArray = function (needle, haystack, start) {
        var length = haystack.length, idx, i;

        if (!start) {
            start = 0;
        }

        for (i = start; i < length; i++) {
            idx = haystack[i].indexOf(needle);
            if (idx !== -1) {
                return new CompoundIndex({row: i, column: idx});
            }
        }
        return emptyCompoundIndex;
    };

    Simulcast.prototype._removeSimulcastGroup = function (lines) {
        var i;

        for (i = lines.length - 1; i >= 0; i--) {
            if (lines[i].indexOf('a=ssrc-group:SIM') !== -1) {
                lines.splice(i, 1);
            }
        }
    };

    Simulcast.prototype._explodeLocalSimulcastSources = function (lines) {
        var sb, msid, sid, tid, videoSources, self;

        if (this.debugLvl) {
            console.info('Exploding local video sources...');
        }

        videoSources = this._parseMedia(lines, ['video'])[0];

        self = this;
        if (videoSources.groups && videoSources.groups.length !== 0) {
            videoSources.groups.forEach(function (group) {
                if (group.semantics === 'SIM') {
                    group.ssrcs.forEach(function (ssrc) {

                        // Get the msid for this ssrc..
                        if (localExplosionMap[ssrc]) {
                            // .. either from the explosion map..
                            msid = localExplosionMap[ssrc];
                        } else {
                            // .. or generate a new one (msid).
                            sid = videoSources.sources[ssrc].msid
                               .substring(0, videoSources.sources[ssrc].msid.indexOf(' '));

                            tid = self._generateGuid();
                            msid = [sid, tid].join(' ');
                            localExplosionMap[ssrc] = msid;
                        }

                        // Assign it to the source object.
                        videoSources.sources[ssrc].msid = msid;

                        // TODO(gp) Change the msid of associated sources.
                    });
                }
            });
        }

        sb = this._compileVideoSources(videoSources);

        this._replaceVideoSources(lines, sb);
    };

    Simulcast.prototype._groupLocalVideoSources = function (lines) {
        var sb, videoSources, ssrcs = [], ssrc;

        if (this.debugLvl) {
            console.info('Grouping local video sources...');
        }

        videoSources = this._parseMedia(lines, ['video'])[0];

        for (ssrc in videoSources.sources) {
            localMaps.msid2ssrc[videoSources.sources[ssrc].msid] = ssrc;
        }

        // TODO(gp) add only "free" sources.
        localMaps.msids.forEach(function (msid) {
            ssrcs.push(localMaps.msid2ssrc[msid]);
        });

        if (!videoSources.groups) {
            videoSources.groups = [];
        }

        videoSources.groups.push({
            'semantics': 'SIM',
            'ssrcs': ssrcs
        });

        sb = this._compileVideoSources(videoSources);

        this._replaceVideoSources(lines, sb);
    };

    Simulcast.prototype._appendSimulcastGroup = function (lines) {
        var videoSources, ssrcGroup, simSSRC, numOfSubs = 3, i, sb, msid;

        if (this.debugLvl) {
            console.info('Appending simulcast group...');
        }

        // Get the primary SSRC information.
        videoSources = this._parseMedia(lines, ['video'])[0];

        // Start building the SIM SSRC group.
        ssrcGroup = ['a=ssrc-group:SIM'];

        // The video source buffer.
        sb = [];

        // Create the simulcast sub-streams.
        for (i = 0; i < numOfSubs; i++) {
            // TODO(gp) prevent SSRC collision.
            simSSRC = this._generateRandomSSRC();
            ssrcGroup.push(simSSRC);

            sb.splice.apply(sb, [sb.length, 0].concat(
                [["a=ssrc:", simSSRC, " cname:", videoSources.base.cname].join(''),
                    ["a=ssrc:", simSSRC, " msid:", videoSources.base.msid].join('')]
            ));

            if (this.debugLvl) {
                console.info(['Generated substream ', i, ' with SSRC ', simSSRC, '.'].join(''));
            }
        }

        // Add the group sim layers.
        sb.splice(0, 0, ssrcGroup.join(' '))

        this._replaceVideoSources(lines, sb);
    };

    // Does the actual patching.
    Simulcast.prototype._ensureSimulcastGroup = function (lines) {
        if (this.debugLvl) {
            console.info('Ensuring simulcast group...');
        }

        if (this._indexOfArray('a=ssrc-group:SIM', lines) === emptyCompoundIndex) {
            this._appendSimulcastGroup(lines);
            this._cacheVideoSources(lines);
        } else {
            // verify that the ssrcs participating in the SIM group are present
            // in the SDP (needed for presence).
            this._restoreVideoSources(lines);
        }
    };

    Simulcast.prototype._ensureGoogConference = function (lines) {
        var sb;
        if (this.debugLvl) {
            console.info('Ensuring x-google-conference flag...')
        }

        if (this._indexOfArray('a=x-google-flag:conference', lines) === emptyCompoundIndex) {
            // Add the google conference flag
            sb = this._getVideoSources(lines);
            sb = ['a=x-google-flag:conference'].concat(sb);
            this._replaceVideoSources(lines, sb);
        }
    };

    Simulcast.prototype._compileVideoSources = function (videoSources) {
        var sb = [], ssrc, addedSSRCs = [];

        if (this.debugLvl) {
            console.info('Compiling video sources...');
        }

        // Add the groups
        if (videoSources.groups && videoSources.groups.length !== 0) {
            videoSources.groups.forEach(function (group) {
                if (group.ssrcs && group.ssrcs.length !== 0) {
                    sb.push([['a=ssrc-group:', group.semantics].join(''), group.ssrcs.join(' ')].join(' '));

                    // if (group.semantics !== 'SIM') {
                        group.ssrcs.forEach(function (ssrc) {
                            addedSSRCs.push(ssrc);
                            sb.splice.apply(sb, [sb.length, 0].concat([
                                ["a=ssrc:", ssrc, " cname:", videoSources.sources[ssrc].cname].join(''),
                                ["a=ssrc:", ssrc, " msid:", videoSources.sources[ssrc].msid].join('')]));
                        });
                    //}
                }
            });
        }

        // Then add any free sources.
        if (videoSources.sources) {
            for (ssrc in videoSources.sources) {
                if (addedSSRCs.indexOf(ssrc) === -1) {
                    sb.splice.apply(sb, [sb.length, 0].concat([
                        ["a=ssrc:", ssrc, " cname:", videoSources.sources[ssrc].cname].join(''),
                        ["a=ssrc:", ssrc, " msid:", videoSources.sources[ssrc].msid].join('')]));
                }
            }
        }

        return sb;
    };

    Simulcast.prototype.transformAnswer = function (desc) {
        if (this.enabled && this.useNativeSimulcast) {

            var sb = desc.sdp.split('\r\n');

            // Even if we have enabled native simulcasting previously
            // (with a call to SLD with an appropriate SDP, for example),
            // createAnswer seems to consistently generate incomplete SDP
            // with missing SSRCS.
            //
            // So, subsequent calls to SLD will have missing SSRCS and presence
            // won't have the complete list of SRCs.
            this._ensureSimulcastGroup(sb);

            desc = new RTCSessionDescription({
                type: desc.type,
                sdp: sb.join('\r\n')
            });

            if (this.debugLvl && this.debugLvl > 1) {
                console.info('Transformed answer');
                console.info(desc.sdp);
            }
        }

        return desc;
    };

    Simulcast.prototype.makeLocalDescriptionPublic = function (desc) {
        var sb;

        if (!desc || desc == null)
            return desc;

        if (this.enabled) {

            if (this.useNativeSimulcast) {
                sb = desc.sdp.split('\r\n');

                this._explodeLocalSimulcastSources(sb);

                desc = new RTCSessionDescription({
                    type: desc.type,
                    sdp: sb.join('\r\n')
                });

                if (this.debugLvl && this.debugLvl > 1) {
                    console.info('Exploded local video sources');
                    console.info(desc.sdp);
                }
            } else {
                sb = desc.sdp.split('\r\n');

                this._groupLocalVideoSources(sb);

                desc = new RTCSessionDescription({
                    type: desc.type,
                    sdp: sb.join('\r\n')
                });

                if (this.debugLvl && this.debugLvl > 1) {
                    console.info('Grouped local video sources');
                    console.info(desc.sdp);
                }
            }
        }

        return desc;
    };

    Simulcast.prototype._ensureOrder = function (lines) {
        var videoSources, sb;

        videoSources = this._parseMedia(lines, ['video'])[0];
        sb = this._compileVideoSources(videoSources);

        this._replaceVideoSources(lines, sb);
    };

    Simulcast.prototype.transformBridgeDescription = function (desc) {
        if (this.enabled) {

            var sb = desc.sdp.split('\r\n');

            // this._ensureRtx(sb);
            this._ensureGoogConference(sb);

            desc = new RTCSessionDescription({
                type: desc.type,
                sdp: sb.join('\r\n')
            });

            if (this.debugLvl) {
                this._disableBundle(desc);
                this._disableRTCPMux(desc);
            }

            if (this.debugLvl && this.debugLvl > 1) {
                console.info('Transformed bridge description');
                console.info(desc.sdp);
            }
        }

        return desc;
    };

    Simulcast.prototype._updateRemoteMaps = function (lines) {
        var remoteVideoSources = this._parseMedia(lines, ['video'])[0], videoSource, quality;

        if (remoteVideoSources.groups && remoteVideoSources.groups.length !== 0) {
            remoteVideoSources.groups.forEach(function (group) {
                if (group.semantics === 'SIM' && group.ssrcs && group.ssrcs.length !== 0) {
                    quality = 0;
                    group.ssrcs.forEach(function (ssrc) {
                        videoSource = remoteVideoSources.sources[ssrc];
                        remoteMaps.msid2Quality[videoSource.msid] = quality++;
                        remoteMaps.ssrc2Msid[videoSource.ssrc] = videoSource.msid;
                    });
                }
            });
        }
    };

    Simulcast.prototype.transformLocalDescription = function (desc) {
        if (this.enabled && !this.useNativeSimulcast) {

            var sb = desc.sdp.split('\r\n');

            this._removeSimulcastGroup(sb);

            desc = new RTCSessionDescription({
                type: desc.type,
                sdp: sb.join('\r\n')
            });

            if (this.debugLvl && this.debugLvl > 1) {
                console.info('Transformed local description');
                console.info(desc.sdp);
            }
        }

        return desc;
    };

    Simulcast.prototype.transformRemoteDescription = function (desc) {
        if (this.enabled) {

            var sb = desc.sdp.split('\r\n');

            this._updateRemoteMaps(sb);
            this._removeSimulcastGroup(sb); // NOTE(gp) this needs to be called after updateRemoteMaps!
            this._ensureGoogConference(sb);

            desc = new RTCSessionDescription({
                type: desc.type,
                sdp: sb.join('\r\n')
            });

            if (this.debugLvl && this.debugLvl > 1) {
                console.info('Transformed remote description');
                console.info(desc.sdp);
            }
        }

        return desc;
    };

    Simulcast.prototype.getRemoteVideoStreamByQuality = function (stream, quality) {
        var tracks, track, i, electedTrack, msid;

        if (this.enabled) {
            tracks = stream.getVideoTracks();
            for (i = 0; i < tracks.length; i++) {
                track = tracks[i];
                msid = [stream.id, track.id].join(' ');
                if (remoteMaps.msid2Quality[msid] === quality) {
                    electedTrack = track;
                    break;
                }
            }
        }

        return (electedTrack)
            ? new webkitMediaStream([electedTrack])
            : stream;
    };

    Simulcast.prototype.getUserVideo = function (success, err) {
        var hqConstraints, lqConstraints;

        if (!this.enabled) {
            throw { name: 'SimulcastException', message: 'Simulcast is not enabled.' };
        }

        if (!this.useNativeSimulcast) {

            // TODO(gp) what if we request a resolution not supported by the hardware?
            hqConstraints = {
                audio: false,
                video: {
                    mandatory: {
                        minWidth: 640,
                        minHeight: 360
                    }
                }
            };

            lqConstraints = {
                audio: false,
                video: {
                    mandatory: {
                        maxWidth: 320,
                        maxHeight: 180
                    }
                }
            };

            // NOTE(gp) if we request the lq stream first webkitGetUserMedia fails randomly. Tested with Chrome 37.

            navigator.webkitGetUserMedia(hqConstraints, function (hqStream) {

                // reset local maps.
                localMaps.msids = [];
                localMaps.msid2ssrc = {};

                navigator.webkitGetUserMedia(lqConstraints, function (lqStream) {

                    // add lq stream to local map
                    localMaps.msids.push([hqStream.id, lqStream.getVideoTracks()[0].id].join(' '));
                    // add hq stream to local map
                    localMaps.msids.push([hqStream.id, hqStream.getVideoTracks()[0].id].join(' '));

                    hqStream.addTrack(lqStream.getVideoTracks()[0]);
                    success(hqStream);
                }, err);
            }, err);
        } else {
            // TODO(gp) grab video for native simulcast
        }
    };

    Simulcast.prototype.getRemoteVideoStreamIdBySSRC = function (primarySSRC) {
        return remoteMaps.ssrc2Msid[primarySSRC];
    };

    Simulcast.prototype.parseMedia = function (desc, mediatypes) {
        var lines = desc.sdp.split('\r\n');
        return this._parseMedia(lines, mediatypes);
    };
}());
