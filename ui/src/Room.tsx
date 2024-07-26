import React, {useCallback, useState, useEffect, useMemo, useRef} from 'react';
import {Badge, IconButton, Paper, Slider, Theme, Tooltip, Typography} from '@mui/material';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import FullScreenIcon from '@mui/icons-material/Fullscreen';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import {useHotkeys} from 'react-hotkeys-hook';
import {Video} from './Video';
import makeStyles from '@mui/styles/makeStyles';
import {ConnectedRoom} from './useRoom';
import {useSnackbar} from 'notistack';
import {RoomUser} from './message';
import {useSettings, VideoDisplayMode} from './settings';
import {SettingDialog} from './SettingDialog';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import Mic from '@mui/icons-material/Mic';
import MicOff from '@mui/icons-material/MicOff';
import {Key} from 'ts-key-enum';

const HostStream: unique symbol = Symbol('mystream');

const flags = (user: RoomUser) => {
    const result: string[] = [];
    if (user.you) {
        result.push('You');
    }
    if (user.owner) {
        result.push('Owner');
    }
    if (user.streaming) {
        result.push('Streaming');
    }
    if (!result.length) {
        return '';
    }
    return ` (${result.join(', ')})`;
};

interface FullScreenHTMLVideoElement extends HTMLVideoElement {
    msRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    webkitRequestFullscreen?: () => void;
}

const requestFullscreen = (element: FullScreenHTMLVideoElement | null) => {
    if (element?.requestFullscreen) {
        element.requestFullscreen();
    } else if (element?.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element?.msRequestFullscreen) {
        element.msRequestFullscreen();
    } else if (element?.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    }
};

export const Room = ({
    state,
    share,
    stopShare,
    setName,
    toggleMicrophone,
}: {
    state: ConnectedRoom;
    share: () => void;
    stopShare: () => void;
    setName: (name: string) => void;
    toggleMicrophone: () => void;
}) => {
    const classes = useStyles();
    const [open, setOpen] = useState(false);
    const {enqueueSnackbar} = useSnackbar();
    const [settings, setSettings] = useSettings();
    const [showControl, setShowControl] = useState(true);
    const [hoverControl, setHoverControl] = useState(false);
    const [selectedStream, setSelectedStream] = useState<string | typeof HostStream>();
    const videoElementRef = useRef<FullScreenHTMLVideoElement | null>(null);
    const [isMuted, setIsMuted] = useState<{[key: string]: boolean}>({});
    const [volumes, setVolumes] = useState<{[key: string]: number}>({});
    const [isMicrophoneOn, setIsMicrophoneOn] = useState(false);

    useShowOnMouseMovement(setShowControl);

    const handleFullscreen = useCallback(() => requestFullscreen(videoElementRef.current), []);

    useEffect(() => {
        if (selectedStream === HostStream && state.hostStream) {
            return;
        }
        if (state.clientStreams.some(({id}) => id === selectedStream)) {
            return;
        }
        if (state.clientStreams.length === 0 && selectedStream) {
            setSelectedStream(undefined);
            return;
        }
        setSelectedStream(state.clientStreams[0]?.id);
    }, [state.clientStreams, selectedStream, state.hostStream]);

    const stream =
        selectedStream === HostStream
            ? state.hostStream
            : state.clientStreams.find(({id}) => selectedStream === id)?.stream;

    useEffect(() => {
        if (videoElementRef.current && stream) {
            videoElementRef.current.srcObject = stream;
            videoElementRef.current
                .play()
                .catch((e) => console.log('Could not play main video', e));
        }
    }, [stream]);

    const updateVideoProperties = useCallback(() => {
        if (videoElementRef.current) {
            videoElementRef.current.muted = isMuted[selectedStream as string] || false;
            videoElementRef.current.volume = (volumes[selectedStream as string] ?? 100) / 100;
        }
    }, [isMuted, volumes, selectedStream]);

    useEffect(() => {
        updateVideoProperties();
    }, [updateVideoProperties]);

    useEffect(() => {
        if (state.hostStream) {
            setIsMuted((prevMuted) => ({
                ...prevMuted,
                [HostStream.toString()]: true,
            }));
        }
    }, [state.hostStream]);

    const copyLink = () => {
        navigator?.clipboard?.writeText(window.location.href)?.then(
            () => enqueueSnackbar('Link Copied', {variant: 'success'}),
            (err) => enqueueSnackbar('Copy Failed ' + err, {variant: 'error'})
        );
    };

    const setHoverState = useMemo(
        () => ({
            onMouseLeave: () => setHoverControl(false),
            onMouseEnter: () => setHoverControl(true),
        }),
        [setHoverControl]
    );

    const controlVisible = showControl || open || hoverControl;

    useHotkeys(
        's',
        () => {
            state.hostStream ? stopShare() : share();
        },
        [state.hostStream]
    );

    useHotkeys(
        'f',
        () => {
            if (selectedStream) {
                handleFullscreen();
            }
        },
        [handleFullscreen, selectedStream]
    );

    useHotkeys('c', copyLink);

    useHotkeys(
        ['h', Key.ArrowLeft],
        () => {
            if (state.clientStreams !== undefined && state.clientStreams.length > 0) {
                const currentStreamIndex = state.clientStreams.findIndex(
                    ({id}) => id === selectedStream
                );
                const nextIndex =
                    currentStreamIndex === state.clientStreams.length - 1
                        ? 0
                        : currentStreamIndex + 1;
                setSelectedStream(state.clientStreams[nextIndex].id);
            }
        },
        [state.clientStreams, selectedStream]
    );

    useHotkeys(
        ['l', Key.ArrowRight],
        () => {
            if (state.clientStreams !== undefined && state.clientStreams.length > 0) {
                const currentStreamIndex = state.clientStreams.findIndex(
                    ({id}) => id === selectedStream
                );
                const previousIndex =
                    currentStreamIndex === 0
                        ? state.clientStreams.length - 1
                        : currentStreamIndex - 1;
                setSelectedStream(state.clientStreams[previousIndex].id);
            }
        },
        [state.clientStreams, selectedStream]
    );

    useHotkeys(
        'm',
        () => {
            if (
                selectedStream &&
                !(
                    state.users.find(({you}) => you === true)?.you &&
                    selectedStream?.toString() === 'Symbol(mystream)'
                )
            ) {
                setIsMuted((prevMuted) => {
                    const newMuted = !prevMuted[selectedStream as string];
                    if (videoElementRef.current) {
                        videoElementRef.current.muted = newMuted;
                    }
                    return {
                        ...prevMuted,
                        [selectedStream as string]: newMuted,
                    };
                });
            }
        },
        [selectedStream, state.users]
    );

    useHotkeys(
        [Key.ArrowUp],
        () => {
            if (
                selectedStream &&
                !(
                    state.users.find(({you}) => you === true)?.you &&
                    selectedStream?.toString() === 'Symbol(mystream)'
                )
            ) {
                setVolumes((prevVolumes) => {
                    const newVolume = Math.min(
                        (prevVolumes[selectedStream as string] ?? 100) + 1,
                        100
                    );
                    if (videoElementRef.current) {
                        videoElementRef.current.volume = newVolume / 100;
                    }
                    return {
                        ...prevVolumes,
                        [selectedStream as string]: newVolume,
                    };
                });
            }
        },
        [selectedStream, state.users]
    );

    useHotkeys(
        [Key.ArrowDown],
        () => {
            if (
                selectedStream &&
                !(
                    state.users.find(({you}) => you === true)?.you &&
                    selectedStream?.toString() === 'Symbol(mystream)'
                )
            ) {
                setVolumes((prevVolumes) => {
                    const newVolume = Math.max(
                        (prevVolumes[selectedStream as string] ?? 100) - 1,
                        0
                    );
                    if (videoElementRef.current) {
                        videoElementRef.current.volume = newVolume / 100;
                    }
                    return {
                        ...prevVolumes,
                        [selectedStream as string]: newVolume,
                    };
                });
            }
        },
        [selectedStream, state.users]
    );

    useHotkeys(
        'ctrl+s',
        () => {
            setOpen(true);
        },
        []
    );

    const handleVolumeChange = (_event: Event, newValue: number | number[]) => {
        if (
            selectedStream &&
            !(state.users.find(({you}) => you === true)?.id === selectedStream.toString())
        ) {
            const volume = newValue as number;
            if (videoElementRef.current) {
                videoElementRef.current.volume = volume / 100;
            }
            setVolumes((prevVolumes) => ({
                ...prevVolumes,
                [selectedStream as string]: volume,
            }));
        }
    };

    const videoClasses = () => {
        switch (settings.displayMode) {
            case VideoDisplayMode.FitToWindow:
                return `${classes.video} ${classes.videoWindowFit}`;
            case VideoDisplayMode.OriginalSize:
                return `${classes.video}`;
            case VideoDisplayMode.FitWidth:
                return `${classes.video} ${classes.videoWindowWidth}`;
            case VideoDisplayMode.FitHeight:
                return `${classes.video} ${classes.videoWindowHeight}`;
        }
    };

    const handleStreamSelection = (streamId: string | typeof HostStream) => {
        if (
            state.users.find(({you}) => you === true)?.you &&
            selectedStream?.toString() === 'Symbol(mystream)'
        ) {
            setIsMuted((prevMuted) => ({
                ...prevMuted,
                [selectedStream as string]: true,
            }));
        }
        setSelectedStream(streamId);
    };

    return (
        <div className={classes.videoContainer}>
            {controlVisible && (
                <Paper className={classes.title} elevation={10} {...setHoverState}>
                    <Tooltip title="Copy Link">
                        <Typography
                            variant="h4"
                            component="h4"
                            style={{cursor: 'pointer'}}
                            onClick={copyLink}
                        >
                            {state.id}
                        </Typography>
                    </Tooltip>
                </Paper>
            )}

            {stream ? (
                <video
                    muted={isMuted[selectedStream as string] || false}
                    ref={videoElementRef}
                    className={videoClasses()}
                    onDoubleClick={handleFullscreen}
                />
            ) : (
                <Typography
                    variant="h4"
                    align="center"
                    component="div"
                    style={{
                        top: '50%',
                        left: '50%',
                        position: 'absolute',
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    no stream available
                </Typography>
            )}

            {controlVisible && (
                <Paper className={classes.control} elevation={10} {...setHoverState}>
                    {state.hostStream ? (
                        <Tooltip title="Cancel Presentation" arrow>
                            <span>
                                <IconButton onClick={stopShare} size="large">
                                    <CancelPresentationIcon fontSize="large" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    ) : (
                        <Tooltip title="Start Presentation" arrow>
                            <span>
                                <IconButton onClick={share} size="large">
                                    <PresentToAllIcon fontSize="large" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    )}

                    <Tooltip
                        classes={{tooltip: classes.noMaxWidth}}
                        title={
                            <div>
                                <Typography variant="h5">Member List</Typography>
                                {state.users.map((user) => (
                                    <Typography key={user.id}>
                                        {user.name} {flags(user)}
                                    </Typography>
                                ))}
                            </div>
                        }
                        arrow
                    >
                        <Badge badgeContent={state.users.length} color="primary">
                            <PeopleIcon fontSize="large" />
                        </Badge>
                    </Tooltip>
                    <Tooltip title="Fullscreen" arrow>
                        <span>
                            <IconButton
                                onClick={() => handleFullscreen()}
                                disabled={
                                    selectedStream?.toString() === 'Symbol(mystream)' &&
                                    state.users.find(({you}) => you === true)?.you
                                }
                                size="large"
                            >
                                <FullScreenIcon fontSize="large" />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Tooltip title="Settings" arrow>
                        <span>
                            <IconButton onClick={() => setOpen(true)} size="large">
                                <SettingsIcon fontSize="large" />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Tooltip title="Sound" arrow>
                        <span>
                            <IconButton
                                onClick={() => {
                                    if (
                                        selectedStream &&
                                        !(
                                            state.users.find(({you}) => you === true)?.id ===
                                            selectedStream.toString()
                                        )
                                    ) {
                                        const newMuted = !isMuted[selectedStream as string];
                                        if (videoElementRef.current) {
                                            videoElementRef.current.muted = newMuted;
                                        }
                                        setIsMuted((prevMuted) => ({
                                            ...prevMuted,
                                            [selectedStream as string]: newMuted,
                                        }));
                                    }
                                }}
                                disabled={
                                    selectedStream?.toString() === 'Symbol(mystream)' &&
                                    state.users.find(({you}) => you === true)?.you
                                }
                            >
                                {isMuted[selectedStream as string] ||
                                selectedStream?.toString() === 'Symbol(mystream)' ? (
                                    <VolumeMuteIcon fontSize="large" />
                                ) : (
                                    <VolumeUpIcon fontSize="large" />
                                )}
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Microphone" arrow>
                        <span>
                            <IconButton
                                onClick={() => {
                                    toggleMicrophone();
                                    setIsMicrophoneOn((prev) => !prev);
                                }}
                                size="large"
                            >
                                {isMicrophoneOn ? (
                                    <Mic fontSize="large" />
                                ) : (
                                    <MicOff fontSize="large" />
                                )}
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Volume" arrow>
                        <div className={classes.volumeSlider}>
                            <Slider
                                value={volumes[selectedStream as string] ?? 100}
                                onChange={handleVolumeChange}
                                aria-labelledby="continuous-slider"
                                step={1}
                                min={0}
                                max={100}
                                disabled={
                                    selectedStream?.toString() === 'Symbol(mystream)' &&
                                    state.users.find(({you}) => you === true)?.you
                                }
                            />
                            <span>{`volume: ${volumes[selectedStream as string] ?? 100}`}</span>
                        </div>
                    </Tooltip>
                </Paper>
            )}

            <div className={classes.bottomContainer}>
                {state.clientStreams
                    .filter(({id}) => id !== selectedStream)
                    .map((client) => {
                        return (
                            <Paper
                                key={client.id}
                                elevation={4}
                                className={classes.smallVideoContainer}
                                onClick={() => handleStreamSelection(client.id)}
                            >
                                <Video
                                    key={client.id}
                                    src={client.stream}
                                    className={classes.smallVideo}
                                    data-stream-id={client.id}
                                />
                                <Typography
                                    variant="subtitle1"
                                    component="div"
                                    align="center"
                                    className={classes.smallVideoLabel}
                                >
                                    {state.users.find(({id}) => client.peer_id === id)?.name ??
                                        'unknown'}
                                </Typography>
                            </Paper>
                        );
                    })}
                {state.hostStream && (
                    <Paper
                        elevation={4}
                        className={classes.smallVideoContainer}
                        onClick={() => handleStreamSelection(HostStream)}
                    >
                        <Video
                            src={state.hostStream}
                            className={classes.smallVideo}
                            data-stream-id={HostStream.toString()}
                        />
                        <Typography
                            variant="subtitle1"
                            component="div"
                            align="center"
                            className={classes.smallVideoLabel}
                        >
                            You
                        </Typography>
                    </Paper>
                )}
                <SettingDialog
                    open={open}
                    setOpen={setOpen}
                    updateName={setName}
                    saveSettings={setSettings}
                />
            </div>
        </div>
    );
};

const useShowOnMouseMovement = (doShow: (s: boolean) => void) => {
    const timeoutHandle = React.useRef(0);

    React.useEffect(() => {
        const update = () => {
            if (timeoutHandle.current === 0) {
                doShow(true);
            }

            clearTimeout(timeoutHandle.current);
            timeoutHandle.current = window.setTimeout(() => {
                timeoutHandle.current = 0;
                doShow(false);
            }, 1000);
        };
        window.addEventListener('mousemove', update);
        return () => window.removeEventListener('mousemove', update);
    }, [doShow]);

    React.useEffect(
        () =>
            void (timeoutHandle.current = window.setTimeout(() => {
                timeoutHandle.current = 0;
                doShow(false);
            }, 1000)),
        []
    );
};

const useStyles = makeStyles((theme: Theme) => ({
    title: {
        padding: 15,
        position: 'fixed',
        background: theme.palette.background.paper,
        top: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
    },
    bottomContainer: {
        position: 'fixed',
        display: 'flex',
        bottom: 0,
        right: 0,
        zIndex: 20,
    },
    control: {
        padding: 15,
        position: 'fixed',
        background: theme.palette.background.paper,
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
    },
    video: {
        display: 'block',
        margin: '0 auto',

        '&::-webkit-media-controls-start-playback-button': {
            display: 'none!important',
        },
        '&::-webkit-media-controls': {
            display: 'none!important',
        },
    },
    smallVideo: {
        minWidth: '100%',
        minHeight: '100%',
        width: 'auto',
        maxWidth: '300px',
        maxHeight: '200px',
    },
    videoWindowFit: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
    },
    videoWindowWidth: {
        height: 'auto',
        width: '100%',
    },
    videoWindowHeight: {
        height: '100%',
        width: 'auto',
    },
    smallVideoLabel: {
        position: 'absolute',
        display: 'block',
        bottom: 0,
        background: 'rgba(0,0,0,.5)',
        padding: '5px 15px',
    },
    noMaxWidth: {
        maxWidth: 'none',
    },
    smallVideoContainer: {
        height: '100%',
        padding: 5,
        maxHeight: 200,
        maxWidth: 400,
        width: '100%',
    },
    videoContainer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        overflow: 'auto',
    },
    volumeSlider: {
        maxWidth: 'auto',
        marginLeft: 15,
        marginRight: 15,
    },
}));
