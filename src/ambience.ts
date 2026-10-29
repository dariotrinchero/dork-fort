const FADE_IN_TIME = 1.5; // duration (in seconds) of fade in on showing a destination
const FADE_OUT_TIME = 0.75; // duration (in seconds) of fade out on leaving it
const VOLUME = 0.35; // volume once faded in, in [0, 1]

// looping sound, routed through a gain node (since iOS ignores volume of audio elements), with timer pausing it
// once faded out
interface Track {
    audio: HTMLAudioElement;
    gain: GainNode;
    pauseTimer?: number;
}

export default class Ambience {
    private context?: AudioContext; // created lazily, as browsers refuse to start audio before a user gesture
    private tracks = new Map<string, Track>(); // by URL of sound
    private playing?: string; // URL of sound playing (or fading in)

    constructor() {
        // browsers keep audio suspended until a user gesture, so retry whenever one happens (eg. when page was
        // loaded straight onto a destination)
        const resume = (): void => { this.resume(); };
        window.addEventListener("pointerdown", resume);
        window.addEventListener("keydown", resume);
    }

    /**
     * Get track playing given sound, creating it on first use.
     *
     * @param url URL of sound
     * @returns track
     */
    private track(url: string): Track {
        const existing = this.tracks.get(url);
        if (existing) return existing;
        this.context ??= new AudioContext();
        const audio = new Audio(url);
        audio.loop = true;
        const gain = this.context.createGain();
        gain.gain.value = 0;
        this.context.createMediaElementSource(audio).connect(gain).connect(this.context.destination);
        const track: Track = { audio, gain };
        this.tracks.set(url, track);
        return track;
    }

    /**
     * Ramp gain of track from its current value to given value.
     *
     * @param track track
     * @param value target gain
     * @param duration duration of ramp (in seconds)
     */
    private ramp({ gain }: Track, value: number, duration: number): void {
        if (!this.context) return;
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(value, now + duration);
    }

    /**
     * Resume audio after a user gesture, starting sound that ought to be playing.
     */
    private resume(): void {
        if (this.context?.state === "suspended") void this.context.resume();
        const track = this.playing === undefined ? undefined : this.tracks.get(this.playing);
        if (track?.audio.paused) track.audio.play().catch(() => undefined);
    }

    /**
     * Fade in given sound (resuming where it left off), fading out any other.
     *
     * @param url URL of sound (or undefined for silence)
     */
    public play(url?: string): void {
        if (url === this.playing) return;
        this.stop();
        if (url === undefined) return;

        this.playing = url;
        const track = this.track(url);
        clearTimeout(track.pauseTimer);
        this.ramp(track, VOLUME, FADE_IN_TIME);
        this.resume();
    }

    /**
     * Fade out sound playing (if any), pausing it once silent.
     */
    public stop(): void {
        const track = this.playing === undefined ? undefined : this.tracks.get(this.playing);
        this.playing = undefined;
        if (!track) return;
        this.ramp(track, 0, FADE_OUT_TIME);
        clearTimeout(track.pauseTimer);
        track.pauseTimer = window.setTimeout(() => { track.audio.pause(); }, FADE_OUT_TIME * 1000);
    }
}
