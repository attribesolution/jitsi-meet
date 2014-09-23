(function () {

    "use strict";

    /**
     * The colors to utilize for the drawing of the chart's datasets i.e. the
     * speakers in the multipoint videoconference.
     */
    var _COLORS = [
        '#fce94f', // Butter
        '#fcaf3e', // Orange
        '#e9b96e', // Chocolate
        '#8ae234', // Chameleon
        '#729fcf', // Sky Blue
        '#ad7fa8', // Plum
        '#ef2929', // Scarlet Red
        '#eeeeec', // Aluminium
        '#888a85', // Aluminium
        '#edd400', // Butter
        '#f57900', // Orange
        '#c17d11', // Chocolate
        '#73d216', // Chameleon
        '#3465a4', // Sky Blue
        '#75507b', // Plum
        '#cc0000', // Scarlet Red
        '#d3d7cf', // Aluminium
        '#555753', // Aluminium
        '#c4a000', // Butter
        '#ce5c00', // Orange
        '#8f5902', // Chocolate
        '#4e9a06', // Chameleon
        '#204a87', // Sky Blue
        '#5c3566', // Plum
        '#a40000', // Scarlet Red
        '#babdb6', // Aluminium
        '#2e3436', // Aluminium
    ];

    /**
     * The interval in milliseconds between subsequent retrievals of the JSON
     * representation of the Dominant Speaker Identification from Videobridge.
     */
    var _GET_DOMINANT_SPEAKER_IDENTIFICATION_JSON_INTERVAL = 1000;

    /**
     * The current, last drawn Chart instance.
     */
    var _chart = null;

    /**
     * Notifies about the success response to an asynchronous AJAX request for
     * the JSON representation of the Dominant Speaker Identification of
     * Videobridge.
     *
     * @param data the JSON representation of the Dominant Speaker
     * Identification of Videobridge
     * @param textStatus
     * @param jqXHR
     */
    function _dominantSpeakerIdentificationJSONGotten(data, textStatus, jqXHR)
    {
        // Draw the data into the canvas.
        var canvas
            = document.getElementById('dominant_speaker_identification_canvas');
        var display = 'none';

        if (canvas)
        {
            if (data)
            {
                var context = canvas.getContext('2d');

                if (context)
                {
                    var speakers = data.speakers;
                    var datasets = [];
                    var labels = [];

                    if (speakers)
                    {
                        // datasets
                        for (var s = 0; s < speakers.length; ++s)
                        {
                            var speaker = speakers[s];
                            var levels = speaker.levels;
                            var label = _getSpeakerLabel(speaker);
                            var color = _COLORS[s % _COLORS.length];

                            datasets.push({
                                'data': levels,
                                'label': label,
                                'strokeColor': color,
                            });
                            if (labels.length < levels.length)
                                labels = new Array(levels.length);
                        }
                    }
                    // labels
                    var t = 0;

                    for (var l = labels.length - 1; l >= 0; --l)
                    {
                        labels[l] = t;
                        t -= 20;
                    }

                    if ((datasets.length > 0) && (labels.length > 0))
                    {
                        // Destroy the previous chart before initializing the
                        // next chart.
                        if (_chart)
                        {
                            _chart.destroy();
                            _chart = null;
                        }
                        // Initialize the new chart.
                        _chart
                            = new Chart(context)
                                .Line({
                                        'datasets': datasets,
                                        'labels': labels,
                                },{
                                        'animation': false,
                                        'datasetFill': false,
                                        'datasetStrokeWidth': 4,
                                        'maintainAspectRatio': false,
                                        'pointDotRadius': 2,
                                        'responsive': true,
                                        'scaleBeginAtZero': true,
                                        'scaleOverride': true,
                                        'scaleStartValue': 0,
                                        'scaleSteps': 13,
                                        'scaleStepWidth': 10,
                                });
                        display = 'block';
                    }
                }
            }
        }

        // Update the legend to describe the latest drawing in the canvas.
        var legend
            = document.getElementById('dominant_speaker_identification_legend');

        if (legend)
        {
            var legendInnerHTML = _chart ? _chart.generateLegend() : '';

            if (legend.innerHTML != legendInnerHTML)
                legend.innerHTML = legendInnerHTML;
        }

        // Show/hide the chart i.e. the drawing and the legend.
        var dominant_speaker_identification
            = document.getElementById('dominant_speaker_identification');

        if (dominant_speaker_identification)
            dominant_speaker_identification.style.display = display;

        // Continue the loop if a GET request succeeds.
        setTimeout(
                _getDominantSpeakerIdentificationJSON,
                _GET_DOMINANT_SPEAKER_IDENTIFICATION_JSON_INTERVAL,
                this.url);
    }

    /**
     * Retrieves the JSON representation of the Dominant Speaker Identification
     * of Videobridge via an asynchronous AJAX request.
     *
     * @param url the URL at which the JSON representation of the Dominant
     * Speaker Identification of Videobridge is to be retrieved
     */
    function _getDominantSpeakerIdentificationJSON(url)
    {
        $.ajax({
            // For cross-domain requests, setting the content type to anything
            // other than application/x-www-form-urlencoded,
            // multipart/form-data, or text/plain will trigger the browser to
            // send a preflight OPTIONS request to the server. The REST API of
            // Videobridge is (1) unlikely to support a (preflight) OPTIONS
            // request and (2) likely to support a content type other than
            // application/json for a GET request.
//            'contentType': 'application/json; charset=UTF-8',
            'dataType': 'json',
            'error': function (jqXHR, textStatus, errorThrown) {
                // Break the loop if a GET request fails.
                console.trace(this.url);
            },
            'success': _dominantSpeakerIdentificationJSONGotten,
            'url': url
        });
    }

    /**
     * Gets the label to be used by <tt>Chart</tt> for the dataset which is to
     * depict a specific <tt>Speaker</tt>.
     *
     * @param speaker the <tt>Speaker</tt> for which a <tt>Chart</tt> dataset
     * label is to be retrieved
     * @return the label to be used by <tt>Chart</tt> for the dataset which is
     * to depict the specified <tt>speaker</tt>
     */
    function _getSpeakerLabel(speaker)
    {
        var endpoint = speaker.endpoint;
        var label = 'SSRC ' + speaker.ssrc;

        if (endpoint)
        {
            // Try to resolve the speaker/SSRC as a remote endpoint.
            var displayName
                = document.getElementById('participant_' + endpoint + '_name');

            if (displayName)
            {
                displayName = displayName.innerText;
                if (displayName)
                    label = displayName;
            }
            else if (endpoint == focus.myMucResource)
            {
                // Otherwise, try to resolve the speaker/SSRC as the local
                // endpoint.
                displayName = document.getElementById('localDisplayName');
                if (displayName)
                {
                    displayName = displayName.innerText;
                    if (displayName)
                        label = displayName;
                }
            }
        }
        return label;
    }

    /**
     * Notifies that a COLIBRI conference has been initialized by a focus.
     *
     * @param event
     * @param colibriFocus
     */
    function _onDocumentConferenceCreatedJingle(event, colibriFocus) {
        // Dominant speaker identification is implemented on Videobridge per
        // conference.
        var conferenceID = colibriFocus.confid;

        if (conferenceID)
        {
            // Dominant speaker identification may be queried through the REST
            // API of Videobridge only at the time of this writing.
            var windowLocation = window.location;
            var protocol = windowLocation.protocol.toLowerCase();
            var port;

            if ("https:" == protocol)
            {
                port = 8443;
            }
            else
            {
                protocol = "http:";
                port = 8080;
            }

            var domain = config.hosts.domain || windowLocation.hostname;
            var url
                = protocol + '//' + domain + ':' + port
                    + '/colibri/conferences/' + conferenceID
                    + '/dominant-speaker-identification';

            _getDominantSpeakerIdentificationJSON(url);
        }
    }

    $(document).on(
            "conferenceCreated.jingle",
            _onDocumentConferenceCreatedJingle);

}).call(this);
