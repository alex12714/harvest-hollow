# Harvest Hollow music: credits

Every track here was made for Harvest Hollow with the **ElevenLabs Music API** (Eleven Music, model `music_v2_5`), from the prompts below, on 2026-11-23 (owner request: replace the old music with calm farm background tracks). They replace the eight CC0 OpenGameArt tracks the game shipped before.
The machine-readable list is `tracks.json` (the music director in `public/js/audio.js` and the Credits view both read
it; `test/audio-music.test.js` checks that this file names every track in it, and that both files of every track exist).

## Licence

Music generated with Eleven Music is used under the ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>, "Last updated: 09 October 2026", read on 2026-11-23):
"As between you and ElevenLabs, you retain any and all rights in and to your Input and Output". On the paid plans from Creator up, the terms permit "All online and offline commercial use … except film, TV, radio, and Studio Games", indie games under $500,000 revenue are permitted, and no attribution is required (the Free plan requires it, and the Free and Starter plans do not allow commercial use). We credit the tool anyway, here and in the game (Settings > Credits).
The API key's plan could not be read back (the key lacks the `user_read` permission), so the plan tier behind these generations is not confirmed here.

| File | Title | Artist | Plays for | Length | Key | Licence | Source |
|---|---|---|---|---|---|---|---|
| `title-menu` | Barn Doors at Sunrise | OnFire (generated with ElevenLabs Music) | title screen | 1:40 | G major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `day-morning` | Morning in the Fields | OnFire (generated with ElevenLabs Music) | day | 2:30 | D major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `day-afternoon` | Lazy Sunny Afternoon | OnFire (generated with ElevenLabs Music) | day, evening (dusk) and Golden Hour | 2:30 | C major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `evening-dusk` | Golden Hour by the Lake | OnFire (generated with ElevenLabs Music) | evening (dusk) and Golden Hour, night | 2:30 | C major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `night-lullaby` | Starlit Lullaby | OnFire (generated with ElevenLabs Music) | night, rain | 2:30 | G major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `rain-inn` | Tea by the Fire | OnFire (generated with ElevenLabs Music) | rain, night | 2:30 | D major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |
| `fair-minstrel` | Village Fair Dance | OnFire (generated with ElevenLabs Music) | the County Fair ceremony and the Festival Pavilion | 1:40 | G major | ElevenLabs Music Terms | <https://elevenlabs.io/music-terms> |

## Barn Doors at Sunrise — OnFire (`title-menu`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 100000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: title screen.
- Key: G major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram, confirmed by the bass chroma); the prompt asked for G major.
- Prompt: "G major, 84 BPM. A warm, welcoming main theme: fingerpicked acoustic guitar and soft felt piano carry a simple, memorable hopeful melody, joined by a gentle solo violin and light cello pad in the second half. Feels like opening the barn doors at sunrise. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (100.0 s), 20 ms fade-in, a 0.4 s fade-out (the take already decays to silence), loudness-normalised (linear) from -17.44 LUFS to -18.5 LUFS (gain 1.06 in `tracks.json` makes up the 0.5 dB; -18 would have needed a limiter), re-encoded.

## Morning in the Fields — OnFire (`day-morning`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 150000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: day.
- Key: D major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram, confirmed by the bass chroma); the prompt asked for D major.
- Prompt: "D major, 92 BPM. Morning in the fields: bright fingerpicked acoustic guitar, a light wooden flute melody, soft pizzicato strings and an occasional glockenspiel sparkle. Fresh, unhurried, optimistic, birdsong-like phrasing. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (150.0 s), 20 ms fade-in, a 0.4 s fade-out (the take already decays to silence), loudness-normalised (linear) from -19.86 LUFS to -20 LUFS (its peaks allow no more without a limiter; gain 1.26 in `tracks.json` lifts it 2 dB in the game), re-encoded.

## Lazy Sunny Afternoon — OnFire (`day-afternoon`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 150000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: day, evening (dusk) and Golden Hour.
- Key: C major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram, confirmed by the bass chroma); the prompt asked for C major.
- Prompt: "C major, 88 BPM. A sunny lazy afternoon on the farm: relaxed strummed acoustic guitar, mandolin or ukulele countermelody, soft upright bass, a clarinet melody, gentle and easygoing. Warm and content. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (150.0 s), 20 ms fade-in, a 0.4 s fade-out (the take already decays to silence), loudness-normalised (linear) from -12.26 LUFS to -18 LUFS, re-encoded.

## Golden Hour by the Lake — OnFire (`evening-dusk`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 150000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: evening (dusk) and Golden Hour, night.
- Key: C major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram: C, E and G lead, B outweighs Bb, and the last chord is on C); the bass chroma leans to F (the take often sits on F under C-major melody), but C's pentatonic (C D E G A) fits the notes best. The prompt asked for F major; `key` uses the measured one.
- Prompt: "F major, 72 BPM. Dusk and golden hour by the lake: slow fingerpicked nylon guitar, soft piano chords, a tender cello melody and warm string pad. Reflective, peaceful, slightly nostalgic but still major and comforting. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (150.0 s), 20 ms fade-in, a 0.4 s fade-out (the take already decays to silence), loudness-normalised (linear) from -12.10 LUFS to -18 LUFS, re-encoded.

## Starlit Lullaby — OnFire (`night-lullaby`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 150000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: night, rain.
- Key: G major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram, confirmed by the bass chroma); the prompt asked for A major. The model did not follow the requested key; `key` uses the measured one.
- Prompt: "A major, 60 BPM. A very soft night lullaby under the stars: solo harp or music-box like celesta with sparse felt piano and a quiet string pad, very slow and sleepy, lots of space. Very quiet and gentle throughout. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (150.0 s), 20 ms fade-in, a 6 s fade-out (the generated take stops mid-phrase), loudness-normalised (linear) from -12.32 LUFS to -18 LUFS, re-encoded.

## Tea by the Fire — OnFire (`rain-inn`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 150000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: rain, night.
- Key: D major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram, confirmed by the bass chroma); the prompt asked for D major.
- Prompt: "D major, 70 BPM. Cozy indoors on a rainy day, by the fireplace with tea: soft felt piano and fingerpicked acoustic guitar, warm muted cello, a little soft accordion or harmonium pad. Comforting, homely, calm. No rain sound effects. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (150.0 s), 20 ms fade-in, a 6 s fade-out (the generated take stops mid-phrase), loudness-normalised (linear) from -16.33 LUFS to -18 LUFS, re-encoded.

## Village Fair Dance — OnFire (`fair-minstrel`)

- Artist: OnFire, generated with ElevenLabs Music (model `music_v2_5`, `force_instrumental: true`, `music_length_ms: 100000`, `output_format=pcm_44100`; first take kept)
- Licence: ElevenLabs Music Terms (<https://elevenlabs.io/music-terms>), checked on 2026-11-23.
- Plays for: the County Fair ceremony and the Festival Pavilion.
- Key: G major, measured from the master (Krumhansl-Schmuckler profile over a linear-magnitude chromagram, confirmed by the bass chroma); the prompt asked for G major.
- Prompt: "G major, 108 BPM. A gentle, cheerful village fair dance: lute or acoustic guitar rhythm, a folk fiddle melody, tin whistle answering phrases and soft hand frame drum played lightly. Festive and friendly but still soft and not loud. Instrumental only, no vocals, no singing, no humming, no choir. No drums, no drum kit, no beat; at most a very soft shaker. Calm, cozy, warm acoustic folk background music for a gentle farming video game, intimate close-miked recording, soft dynamics, no sudden loud moments. Starts softly with a gentle one-bar intro and ends softly on the tonic chord with a natural decay, so it loops well as background."
- Changes: whole length kept (100.0 s), 20 ms fade-in, a 0.4 s fade-out (the take already decays to silence), loudness-normalised (linear) from -13.45 LUFS to -18 LUFS, re-encoded.

## How these files were made

Generation: `POST https://api.elevenlabs.io/v1/music?output_format=pcm_44100` with `{"prompt", "music_length_ms", "model_id": "music_v2_5", "force_instrumental": true}`; the response is raw 16-bit stereo PCM at 44.1 kHz, wrapped into a WAV. Seven generations in all, one per track: every first take passed the checks below. The prompts, takes and WAV masters stay outside the repository (`harvest-hollow-music-masters/`, with `prompts.json` holding every request exactly as sent).

Checks on every take: no clipped samples, the true peak, the level of the first and last seconds and the largest second-to-second jump (an abrupt start or end), and a whisper.cpp (`ggml-base.en`) transcription to catch vocals: every take transcribed as only "(gentle music)", "(upbeat music)" or "(gentle guitar music)", with no words.

Tools: `ffmpeg version 7.1-https://www.martin-riedl.de Copyright (c) 2000-2024 the FFmpeg developers` (`libvorbis` and the native `aac` encoder).

For every track:

1. Measure the take with the same filter chain and `loudnorm` in measuring mode (the values feed step 2):
   `ffmpeg -hide_banner -nostats -i <take>.wav -map 0:a -af <chain>,loudnorm=I=-18.0:TP=-1.0:LRA=20:print_format=json -f null -`
   where `<chain>` is the part of step 2's `-af` before `loudnorm` (resample to 44.1 kHz stereo, fade in and out).
2. Normalise linearly to -18 LUFS (title: -18.5, day-morning: -20, which their peaks allow without a limiter), true peak at most -1 dBTP, into a 16-bit WAV master.
3. Encode the master twice: Ogg Vorbis at quality 0.6 (about 70 kbit/s; Chrome, Firefox, Android) and AAC-LC at
   64 kbit/s in MP4 with the index at the front (`+faststart`, so Safari can start playing while it streams). These match the settings of the tracks they replace, which keeps the set inside the 20 MB budget.

The exact commands (steps 2 and 3), in the order they ran on 2026-11-23:

```sh
# title-menu
ffmpeg -hide_banner -nostats -y -i title-menu.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=99.600:d=0.4,loudnorm=I=-18.5:TP=-1.0:LRA=20:measured_I=-17.44:measured_TP=-0.27:measured_LRA=3.30:measured_thresh=-27.68:offset=0.06:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/title-menu.wav
ffmpeg -hide_banner -nostats -y -i master/title-menu.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 title-menu.ogg
ffmpeg -hide_banner -nostats -y -i master/title-menu.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart title-menu.m4a

# day-morning
ffmpeg -hide_banner -nostats -y -i day-morning.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=149.600:d=0.4,loudnorm=I=-20.0:TP=-1.0:LRA=20:measured_I=-19.86:measured_TP=-0.99:measured_LRA=8.40:measured_thresh=-30.13:offset=-1.54:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/day-morning.wav
ffmpeg -hide_banner -nostats -y -i master/day-morning.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 day-morning.ogg
ffmpeg -hide_banner -nostats -y -i master/day-morning.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart day-morning.m4a

# day-afternoon
ffmpeg -hide_banner -nostats -y -i day-afternoon.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=149.600:d=0.4,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-12.26:measured_TP=-0.33:measured_LRA=3.20:measured_thresh=-22.53:offset=-0.20:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/day-afternoon.wav
ffmpeg -hide_banner -nostats -y -i master/day-afternoon.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 day-afternoon.ogg
ffmpeg -hide_banner -nostats -y -i master/day-afternoon.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart day-afternoon.m4a

# evening-dusk
ffmpeg -hide_banner -nostats -y -i evening-dusk.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=149.600:d=0.4,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-12.10:measured_TP=-0.76:measured_LRA=2.40:measured_thresh=-22.20:offset=-0.48:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/evening-dusk.wav
ffmpeg -hide_banner -nostats -y -i master/evening-dusk.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 evening-dusk.ogg
ffmpeg -hide_banner -nostats -y -i master/evening-dusk.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart evening-dusk.m4a

# night-lullaby
ffmpeg -hide_banner -nostats -y -i night-lullaby.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=144.000:d=6.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-12.32:measured_TP=-1.03:measured_LRA=3.40:measured_thresh=-22.44:offset=-0.28:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/night-lullaby.wav
ffmpeg -hide_banner -nostats -y -i master/night-lullaby.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 night-lullaby.ogg
ffmpeg -hide_banner -nostats -y -i master/night-lullaby.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart night-lullaby.m4a

# rain-inn
ffmpeg -hide_banner -nostats -y -i rain-inn.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=144.000:d=6.0,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-16.33:measured_TP=-0.37:measured_LRA=4.60:measured_thresh=-26.47:offset=-0.66:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/rain-inn.wav
ffmpeg -hide_banner -nostats -y -i master/rain-inn.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 rain-inn.ogg
ffmpeg -hide_banner -nostats -y -i master/rain-inn.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart rain-inn.m4a

# fair-minstrel
ffmpeg -hide_banner -nostats -y -i fair-minstrel.take1.wav -map 0:a -map_metadata -1 -af aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=99.600:d=0.4,loudnorm=I=-18.0:TP=-1.0:LRA=20:measured_I=-13.45:measured_TP=-1.02:measured_LRA=3.90:measured_thresh=-23.77:offset=-0.52:linear=true:print_format=json,aresample=44100 -c:a pcm_s16le master/fair-minstrel.wav
ffmpeg -hide_banner -nostats -y -i master/fair-minstrel.wav -map_metadata -1 -c:a libvorbis -q:a 0.6 fair-minstrel.ogg
ffmpeg -hide_banner -nostats -y -i master/fair-minstrel.wav -map_metadata -1 -c:a aac -b:a 64k -movflags +faststart fair-minstrel.m4a
```

`key` in `tracks.json` (the pitch class the drag-pluck ladder plays along in) is the measured key of each master, not the requested one.

Budget: the 14 files total 15.87 MB (15.14 MiB); the test keeps the total at or under 20 MB.
