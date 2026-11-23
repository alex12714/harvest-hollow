# Harvest Hollow music: credits

Every track here was made for Harvest Hollow with the **ElevenLabs Music API** (Eleven Music, model `music_v2_5`), from the prompts below, on 2026-11-23. Owner request: "for the farm game generate different music - just background music", so this set is unobtrusive ambient background music (soft warm pads, gentle textures, slow, minimal melody, no beat, no vocals) that sits under the game. It replaces the seven acoustic-folk ElevenLabs tracks shipped earlier the same day.
The machine-readable list is `tracks.json` (the music director in `public/js/audio.js` and the Credits view both read
it; `test/audio-music.test.js` checks that this file names every track in it, and that both files of every track exist).

## Licence

Music generated with Eleven Music is used under the ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>, "Last updated: 09 October 2026", read on 2026-11-23):
"As between you and ElevenLabs, you retain any and all rights in and to your Input and Output". On the paid plans from Creator up, the terms permit "All online and offline commercial use … except film, TV, radio, and Studio Games", indie games under $500,000 revenue are permitted, and no attribution is required (the Free plan requires it, and the Free and Starter plans do not allow commercial use). We credit the tool anyway, here and in the game (Settings > Credits).
The API key's plan could not be read back (the key lacks the `user_read` permission), so the plan tier behind these generations is not confirmed here.

| File | Title | Artist | Plays for | Length | Key | Licence | Source |
|---|---|---|---|---|---|---|---|
| `hollow-morning` | Mist over the Hollow | OnFire (generated with ElevenLabs Music) | title screen, day | 3:00 | D (pentatonic) | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `meadow-haze` | Meadow Haze | OnFire (generated with ElevenLabs Music) | day, evening (dusk) and Golden Hour | 3:20 | C (pentatonic) | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `amber-dusk` | Amber Dusk | OnFire (generated with ElevenLabs Music) | evening (dusk) and Golden Hour, night | 3:10 | G (pentatonic) | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `still-night` | Still Night Fields | OnFire (generated with ElevenLabs Music) | night, rain | 3:20 | Bb (pentatonic) | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `rain-hush` | Rain on the Barn Roof | OnFire (generated with ElevenLabs Music) | rain, night | 3:10 | Ab (pentatonic) | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `lantern-fair` | Lanterns at the Fair | OnFire (generated with ElevenLabs Music) | the County Fair ceremony and the Festival Pavilion | 2:40 | F (pentatonic) | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |

## Mist over the Hollow — OnFire (`hollow-morning`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 180000`, `output_format=pcm_44100`; take 1 kept (a second take was generated and rejected: its level swings by 15 LU, too much contrast for background music))
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: title screen, day.
- Key: D, measured: the bass sits on a D drone and D major pentatonic fits the notes best; the Krumhansl-Schmuckler profile scores A major (0.75) just over D major (0.69). The prompt asked for D major.
- Prompt: "D major, very slow, free time. Morning mist over a quiet farm valley: warm analog string pad and soft breathy synth pad, sustained low drone on D, very distant sparse fingerpicked acoustic guitar harmonics now and then, airy and hopeful. Instrumental only, no vocals, no singing, no humming, no choir, no voices. No drums, no percussion, no beat, no pulse, no rhythm section, no plucked ostinato. Unobtrusive ambient background music for a calm farming video game: slow evolving warm soft pads and gentle textures, minimal melody, no lead instrument stepping forward, nothing catchy, very low dynamic contrast, steady quiet level throughout, no build-ups, no climax, no sudden changes. Fades in softly and fades out softly into silence so it loops seamlessly."
- Changes: whole length kept (180.0 s), a 3 s fade-in, the take does not end on its own and its one full-scale sample sits in the last seconds, so an 8 s fade-out, loudness-normalised (linear) from -18.38 LUFS to -18 LUFS, re-encoded.

## Meadow Haze — OnFire (`meadow-haze`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 200000`, `output_format=pcm_44100`; take 1 kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: day, evening (dusk) and Golden Hour.
- Key: C, measured: C major pentatonic (C D E G A) fits the notes best by far (0.94 of the energy); the Krumhansl-Schmuckler profile reads E minor / G major, and the pad has no firm tonic. The prompt asked for G major; `key` uses the measured best fit.
- Prompt: "G major, very slow, free time. A hazy sunny afternoon in the meadow: soft warm pads, gentle sustained felt piano chords far in the background, a faint airy flute-like texture drifting in long held tones, peaceful and content. Instrumental only, no vocals, no singing, no humming, no choir, no voices. No drums, no percussion, no beat, no pulse, no rhythm section, no plucked ostinato. Unobtrusive ambient background music for a calm farming video game: slow evolving warm soft pads and gentle textures, minimal melody, no lead instrument stepping forward, nothing catchy, very low dynamic contrast, steady quiet level throughout, no build-ups, no climax, no sudden changes. Fades in softly and fades out softly into silence so it loops seamlessly."
- Changes: whole length kept (200.0 s), a 3 s fade-in, a 4 s fade-out into silence, loudness-normalised (linear) from -14.42 LUFS to -18 LUFS, re-encoded.

## Amber Dusk — OnFire (`amber-dusk`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 190000`, `output_format=pcm_44100`; take 1 kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: evening (dusk) and Golden Hour, night.
- Key: G, measured: the bass sits on G and D, and G major pentatonic fits the notes best (0.97); the Krumhansl-Schmuckler profile scores D major. The prompt asked for C major; the model did not follow it.
- Prompt: "C major, very slow, free time. Golden dusk over the fields: warm low cello-like drone, soft swelling string pad, gentle tape-warm synth textures, a few distant soft piano notes with long reverb, tender and reflective. Instrumental only, no vocals, no singing, no humming, no choir, no voices. No drums, no percussion, no beat, no pulse, no rhythm section, no plucked ostinato. Unobtrusive ambient background music for a calm farming video game: slow evolving warm soft pads and gentle textures, minimal melody, no lead instrument stepping forward, nothing catchy, very low dynamic contrast, steady quiet level throughout, no build-ups, no climax, no sudden changes. Fades in softly and fades out softly into silence so it loops seamlessly."
- Changes: whole length kept (190.0 s), a 3 s fade-in, a 1 s fade-out (the take already fades to silence), loudness-normalised (linear) from -18.41 LUFS to -18 LUFS, re-encoded.

## Still Night Fields — OnFire (`still-night`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 200000`, `output_format=pcm_44100`; take 1 kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: night, rain.
- Key: Bb, the measured tonic: the bass sits on Bb and the Krumhansl-Schmuckler profile scores Bb major (0.70), but no major pentatonic fits this pad well (best 0.69), so there is no clear key and `key` is the measured tonic. The prompt asked for A major.
- Prompt: "A major, very slow, free time. A still starry night on the farm: very soft deep pad, gentle shimmering high texture like distant glass, sparse soft celesta tones far away, sleepy, spacious and very quiet. Instrumental only, no vocals, no singing, no humming, no choir, no voices. No drums, no percussion, no beat, no pulse, no rhythm section, no plucked ostinato. Unobtrusive ambient background music for a calm farming video game: slow evolving warm soft pads and gentle textures, minimal melody, no lead instrument stepping forward, nothing catchy, very low dynamic contrast, steady quiet level throughout, no build-ups, no climax, no sudden changes. Fades in softly and fades out softly into silence so it loops seamlessly."
- Changes: whole length kept (200.0 s), a 3 s fade-in, a 1 s fade-out (the take already fades to silence), loudness-normalised (linear) from -15.19 LUFS to -18 LUFS, re-encoded.

## Rain on the Barn Roof — OnFire (`rain-hush`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 190000`, `output_format=pcm_44100`; take 1 kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: rain, night.
- Key: Ab, measured: Ab major pentatonic fits the notes best (0.84) and the bass leans on Ab; the Krumhansl-Schmuckler profile scores Eb major (0.76), so the key is soft. The prompt asked for F major; the model did not follow it.
- Prompt: "F major, very slow, free time. Cozy grey rainy day seen from inside the barn: muffled warm pads, soft harmonium-like drone, faint mellow felt piano chords far in the background, calm and comforting. No rain sound effects. Instrumental only, no vocals, no singing, no humming, no choir, no voices. No drums, no percussion, no beat, no pulse, no rhythm section, no plucked ostinato. Unobtrusive ambient background music for a calm farming video game: slow evolving warm soft pads and gentle textures, minimal melody, no lead instrument stepping forward, nothing catchy, very low dynamic contrast, steady quiet level throughout, no build-ups, no climax, no sudden changes. Fades in softly and fades out softly into silence so it loops seamlessly."
- Changes: whole length kept (190.0 s), a 3 s fade-in, a 4 s fade-out into silence, loudness-normalised (linear) from -31.53 LUFS to -18 LUFS, re-encoded.

## Lanterns at the Fair — OnFire (`lantern-fair`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 160000`, `output_format=pcm_44100`; take 1 kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: the County Fair ceremony and the Festival Pavilion.
- Key: F, measured: F major pentatonic fits the notes best (0.97), with the bass on G and F; the Krumhansl-Schmuckler profile is weak (A minor 0.55). The prompt asked for G major; the model did not follow it.
- Prompt: "G major, slow, gentle. Lanterns at the village fair in the evening, heard from the edge of the field: warm bright pads, soft music-box and celesta shimmer in long sustained tones, a faint distant accordion drone, slightly brighter and festive but still soft background ambience. Instrumental only, no vocals, no singing, no humming, no choir, no voices. No drums, no percussion, no beat, no pulse, no rhythm section, no plucked ostinato. Unobtrusive ambient background music for a calm farming video game: slow evolving warm soft pads and gentle textures, minimal melody, no lead instrument stepping forward, nothing catchy, very low dynamic contrast, steady quiet level throughout, no build-ups, no climax, no sudden changes. Fades in softly and fades out softly into silence so it loops seamlessly."
- Changes: whole length kept (160.0 s), a 3 s fade-in, a 3 s fade-in (the take starts at full level) and a 1 s fade-out, loudness-normalised (linear) from -13.05 LUFS to -18 LUFS, re-encoded.

## How these files were made

Generation: `POST https://api.elevenlabs.io/v1/music?output_format=pcm_44100` with `{"prompt", "music_length_ms", "model_id": "music_v2_5", "force_instrumental": true}` (the request shape checked against the ElevenLabs API reference on 2026-11-23); the response is raw 16-bit stereo PCM at 44.1 kHz, wrapped into a WAV. Seven generations in all: one per track, plus a second take of `hollow-morning` that was rejected. The prompts, takes and WAV masters stay outside the repository (`harvest-hollow-music-masters/ambient/`, with `prompts.json` holding every request exactly as sent).

Checks on every take: no clipped samples (the one full-scale sample in `hollow-morning` lies under its fade-out), the true peak, the level of the first and last seconds, a whisper.cpp (`ggml-base.en`) transcription to catch vocals (every take transcribed as only "(gentle music)" or "(dramatic music)", with no words), percussiveness (spectral-flux onsets: 0.01-0.35 per second for the five scene tracks and 1.0 for the Fair's soft music-box shimmer, against 2.6-3.7 for the folk tracks they replace), and dynamic spread (EBU R128 loudness range 2.3-8.0 LU; 1 s RMS spread, 10th to 95th percentile, 3.4-7.3 dB).

Tools: `ffmpeg version 7.1-https://www.martin-riedl.de Copyright (c) 2000-2024 the FFmpeg developers` (`libvorbis` and the native `aac` encoder).

For every track:

1. Measure the take with the same filter chain and `loudnorm` in measuring mode (the values feed step 2):
   `ffmpeg -hide_banner -nostats -i <take>.wav -map 0:a -af <chain>,loudnorm=I=-18.0:TP=-1.0:LRA=20:print_format=json -f null -`
   where `<chain>` is the part of step 2's `-af` before `loudnorm` (resample to 44.1 kHz stereo, fade in and out).
2. Normalise linearly to -18 LUFS, true peak at most -1 dBTP, into a 16-bit WAV master.
3. Encode the master twice: Ogg Vorbis at quality 0.6 (about 70 kbit/s; Chrome, Firefox, Android) and AAC-LC at
   64 kbit/s in MP4 with the index at the front (`+faststart`, so Safari can start playing while it streams). These match the settings of the tracks they replace, which keeps the set inside the 20 MB budget.

The exact commands (steps 2 and 3), in the order they ran on 2026-11-23:

```sh
# hollow-morning
ffmpeg -hide_banner -nostats -y -i hollow-morning.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=3.0,afade=t=out:st=172.000:d=8.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-18.38:measured_TP=-6.31:measured_LRA=3.20:measured_thresh=-28.64:offset=-0.44:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/hollow-morning.wav
ffmpeg -hide_banner -nostats -y -i master/hollow-morning.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 hollow-morning.ogg
ffmpeg -hide_banner -nostats -y -i master/hollow-morning.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart hollow-morning.m4a

# meadow-haze
ffmpeg -hide_banner -nostats -y -i meadow-haze.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=3.0,afade=t=out:st=196.000:d=4.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-14.42:measured_TP=-2.16:measured_LRA=3.20:measured_thresh=-24.60:offset=-0.60:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/meadow-haze.wav
ffmpeg -hide_banner -nostats -y -i master/meadow-haze.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 meadow-haze.ogg
ffmpeg -hide_banner -nostats -y -i master/meadow-haze.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart meadow-haze.m4a

# amber-dusk
ffmpeg -hide_banner -nostats -y -i amber-dusk.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=3.0,afade=t=out:st=189.000:d=1.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-18.41:measured_TP=-4.88:measured_LRA=7.90:measured_thresh=-28.80:offset=-1.25:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/amber-dusk.wav
ffmpeg -hide_banner -nostats -y -i master/amber-dusk.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 amber-dusk.ogg
ffmpeg -hide_banner -nostats -y -i master/amber-dusk.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart amber-dusk.m4a

# still-night
ffmpeg -hide_banner -nostats -y -i still-night.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=3.0,afade=t=out:st=199.000:d=1.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-15.19:measured_TP=-2.62:measured_LRA=5.50:measured_thresh=-25.46:offset=-0.76:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/still-night.wav
ffmpeg -hide_banner -nostats -y -i master/still-night.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 still-night.ogg
ffmpeg -hide_banner -nostats -y -i master/still-night.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart still-night.m4a

# rain-hush
ffmpeg -hide_banner -nostats -y -i rain-hush.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=3.0,afade=t=out:st=186.000:d=4.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-31.53:measured_TP=-16.68:measured_LRA=7.70:measured_thresh=-41.68:offset=-0.93:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/rain-hush.wav
ffmpeg -hide_banner -nostats -y -i master/rain-hush.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 rain-hush.ogg
ffmpeg -hide_banner -nostats -y -i master/rain-hush.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart rain-hush.m4a

# lantern-fair
ffmpeg -hide_banner -nostats -y -i lantern-fair.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=3.0,afade=t=out:st=159.000:d=1.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-13.05:measured_TP=-0.91:measured_LRA=4.70:measured_thresh=-23.29:offset=-0.13:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/lantern-fair.wav
ffmpeg -hide_banner -nostats -y -i master/lantern-fair.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 lantern-fair.ogg
ffmpeg -hide_banner -nostats -y -i master/lantern-fair.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart lantern-fair.m4a
```

`key` in `tracks.json` (the pitch class the drag-pluck ladder plays along in) is the measured key of each master, not the requested one: the best-fitting major pentatonic over a chromagram, checked against the Krumhansl-Schmuckler profile and the bass; where the pad has no clear key, the measured tonic.

Budget: the 12 files total 16.99 MB (16.20 MiB); the test keeps the total at or under 20 MB.
