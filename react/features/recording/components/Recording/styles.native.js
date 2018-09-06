// @flow

import { BoxModel, createStyleSheet } from '../../../base/styles';

const padding = BoxModel.padding * 1.5;

/**
 * The styles of the React {@code Components} of the feature recording.
 */
export default createStyleSheet({
    header: {
        flex: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: padding,
        paddingBottom: padding
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold'
    },
    container: {
        flex: 0,
        flexDirection: 'column'
    },
    switch: {
        paddingRight: BoxModel.padding
    },
    loggedIn: {
        paddingBottom: padding
    },
    startRecordingText: {
        paddingBottom: padding
    }
});
