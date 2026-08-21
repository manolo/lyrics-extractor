// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// manifest.json is read by MuseScore, not by us, so nothing here fails when a field is
// wrong: the extension simply loads with something missing, and only looking at the
// toolbar says so. These are the fields whose value MuseScore resolves against something
// it already knows, which is where a plausible looking value goes wrong silently.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");

var BASE = path.resolve(__dirname, "..", "..");
var manifest = JSON.parse(fs.readFileSync(path.join(BASE, "manifest.json"), "utf8"));

// The names of muse::ui::IconCode::Code as of MuseScore 4.7, read from
// src/framework/ui/view/iconcodes.h.
//
// The manifest names an icon as a string, and extensionsloader.cpp resolves it with
// IconCode::fromString, which returns Code::NONE for a name that is not in the enum. NONE is
// 0xFFFF, an empty slot in the icon font, and FlatButton reads it as "this button has no
// icon" and sizes itself as TextOnly instead of IconOnly: 132 points wide, showing the title
// only if the toolbar asked for one, which the extensions toolbar does not. So a name with a
// typo in it, or one that reads correctly but was never in the enum, produces a wide blank
// button that still opens the plugin when clicked. That is what "TEXT" did here, and what
// this test exists to catch.
//
// Two names of the enum are deliberately absent. NONE is the fallback, not an icon.
// GRADUATION_CAP is a name whose code point, 0xF19D, has no glyph in MusescoreIcon.ttf: found
// by reading the font's cmap against the enum, and confirmed by drawing it, which inks no
// pixels. It would pass as a name and draw nothing, which is the same failure by another road.
var ICON_CODES = (
    "ACCENT ACCIACCATURA ACCIDENTAL_SHARP ACCOUNT ALIGN_HORIZONTAL_CENTER ALIGN_LEFT ALIGN_RIGHT " +
    "ALIGN_TOP ALIGN_VERTICAL_CENTER AMBITUS AMBITUS_LEANING_LEFT AMBITUS_LEANING_RIGHT " +
    "APPLY_GLOBAL_STYLE APPOGGIATURA APP_CLOSE APP_MAXIMIZE APP_MINIMIZE APP_UNMAXIMIZE " +
    "ARROW_DOWN ARROW_LEFT ARROW_RIGHT ARROW_UP ARTICULATION AUDIO AUDIO_COM_LOGO AUTOMATION " +
    "AUTO_TEXT BARLINE_UNWINGED BARLINE_WINGED BEAM_BREAK_INNER_16TH BEAM_BREAK_INNER_8TH " +
    "BEAM_BREAK_LEFT BEAM_FEATHERED_ACCELERATE BEAM_FEATHERED_DECELERATE " +
    "BEAM_FEATHERING_LEFT_HEIGHT BEAM_FEATHERING_RIGHT_HEIGHT BEAM_HEIGHT_LEFT BEAM_HEIGHT_RIGHT " +
    "BEAM_JOIN BEAM_NONE BOTTOM_MARGIN BPM BRACE BRACKET BRACKET_PARENTHESES " +
    "BRACKET_PARENTHESES_SQUARE BRAILLE BRUSH BYPASS CAMERA CHEVRON_LEFT CHEVRON_RIGHT " +
    "CHORD_BASS_ALIGN CHORD_SYMBOL CIRCLE CLEF_BASS CLEF_TREBLE CLOCK CLOSE_X_ROUNDED CLOUD " +
    "CLOUD_FILE CLOUD_FILL CONFIGURE CONTINUOUS_VIEW CONTINUOUS_VIEW_VERTICAL COPY COUNT_IN " +
    "CRESCENDO CRESCENDO_LINE CROSS CROSS_STAFF_BEAMING CUT DELETE_TANK DIMINUENDO DOT_ABOVE_LINE " +
    "DOT_BELOW_LINE DOUBLE_BAR_LINE DOWN DURATION_CURSOR DYNAMIC_CENTER_1 DYNAMIC_CENTER_2 " +
    "DYNAMIC_FORTE EDIT ERROR EXPRESSION EYE_CLOSED EYE_OPEN EYE_OPEN_THICK FEEDBACK FERMATA " +
    "FILLED_ARROW_LEFT FILLED_ARROW_RIGHT FIT_PROJECT FIT_SELECTION FLAT FLAT_DOUBLE FOOT_PEDAL " +
    "FRACTION_DIAGONAL FRACTION_LEVEL FRAME_CIRCLE FRAME_SQUARE FRETBOARD_BARRE_LINE " +
    "FRETBOARD_BARRE_SLUR FRETBOARD_DIAGRAM FRETBOARD_EXTENDED FRETBOARD_HORIZONTAL " +
    "FRETBOARD_MARKER_CIRCLE_FILLED FRETBOARD_MARKER_CIRCLE_OUTLINE FRETBOARD_MARKER_TRIANGLE " +
    "FRETBOARD_VERTICAL FRET_FRAME GAP_ABOVE GAP_BELOW GLISSANDO GLOBE GRACE16 GRACE16_AFTER " +
    "GRACE32 GRACE32_AFTER GRACE4 GRACE8_AFTER GRID GUITAR_BEND GUITAR_BEND_REGULAR " +
    "GUITAR_BEND_STYLE_1 GUITAR_BEND_STYLE_FULL GUITAR_DIP_DOWN GUITAR_DIP_UP GUITAR_DIVE_REGULAR " +
    "GUITAR_GRACE_NOTE_BEND GUITAR_PRE_BEND GUITAR_PRE_DIVE GUITAR_SCOOP GUITAR_SLIGHT_BEND " +
    "GUITAR_TREMOLO_BAR HAIRPIN HIDE_EMPTY_STAVES HORIZONTAL HORIZONTAL_FRAME HP_LOWER_CASE " +
    "HP_UPPER_CASE IMAGE_MOUNTAINS IMPORT INFO INSERT_ONE_MEASURE INSIGHT JUMP KEY_SIGNATURE " +
    "KEY_SIGNATURE_1_FLAT KEY_SIGNATURE_1_SHARP KEY_SIGNATURE_2_FLAT KEY_SIGNATURE_2_SHARPS " +
    "KEY_SIGNATURE_3_FLAT KEY_SIGNATURE_3_SHARPS KEY_SIGNATURE_4_FLAT KEY_SIGNATURE_4_SHARPS " +
    "KEY_SIGNATURE_5_FLAT KEY_SIGNATURE_5_SHARPS KEY_SIGNATURE_6_FLAT KEY_SIGNATURE_6_SHARPS " +
    "KEY_SIGNATURE_7_FLAT KEY_SIGNATURE_7_SHARPS KEY_SIGNATURE_NONE LEARN LEFT_GAP LEFT_MARGIN " +
    "LET_RING LINE_ARROW_LEFT LINE_ARROW_RIGHT LINE_BREAK LINE_DASHED LINE_DOTTED LINE_NORMAL " +
    "LINE_PEDAL_STAR_ENDING LINE_WIDE_DASHED LINE_WITH_ANGLED_END_HOOK " +
    "LINE_WITH_ANGLED_START_HOOK LINE_WITH_END_HOOK LINE_WITH_INVERTED_START_HOOK " +
    "LINE_WITH_START_HOOK LINE_WITH_TWO_INVERTED_HOOKS LINE_WITH_T_LIKE_END_HOOK " +
    "LINE_WITH_T_LINE_START_HOOK LINK LIST LOCK_CLOSED LOCK_OPEN LONGO LOOP LOOP_IN LOOP_OUT " +
    "LV_CHORD_INSIDE LV_CHORD_OUTSIDE LV_INSIDE LV_OUTSIDE LYRICS MAGNET MARCATO MARKER " +
    "MEASURE_REPEAT MENU_THREE_DOTS METRONOME MICROPHONE MIDI_INPUT MINUS MIXER MORTAR_BOARD " +
    "MULTIMEASURE_REST MUSESCORE_COM_LOGO MUSIC_NOTES MUTE NATURAL NEW_FILE NOTEFLAGS_STRAIGHT " +
    "NOTEFLAGS_TRADITIONAL NOTE_1024TH NOTE_128TH NOTE_16TH NOTE_256TH NOTE_32ND NOTE_512TH " +
    "NOTE_64TH NOTE_8TH NOTE_ALIGN_CENTER NOTE_ALIGN_LEFT NOTE_ALIGN_RIGHT NOTE_ANCHORED_LINE " +
    "NOTE_DOTTED NOTE_DOTTED_2 NOTE_DOTTED_3 NOTE_DOTTED_4 NOTE_FLIP NOTE_HALF NOTE_HEAD " +
    "NOTE_HEAD_BREVIS NOTE_HEAD_HALF NOTE_HEAD_PARENTHESES NOTE_HEAD_QUARTER NOTE_HEAD_WHOLE " +
    "NOTE_LV NOTE_PLUS NOTE_QUARTER NOTE_SLUR NOTE_TIE NOTE_TO_RIGHT NOTE_TUPLET NOTE_WHOLE " +
    "NOTE_WHOLE_DOUBLE NO_BREAK OPEN_FILE OPEN_LINK ORIENTATION_LANDSCAPE ORIENTATION_PORTRAIT " +
    "ORNAMENT OTTAVA PAGE PAGE_BREAK PAGE_VIEW PALM_MUTE PAN_SCORE PASTE PAUSE PAUSE_FILL " +
    "PEDAL_MARKING PERCUSSION PLAY PLAYHEAD PLAYHEAD_FILLED PLAY_FILL PLAY_REPEATS PLUGIN PLUS " +
    "POSITION_ARROWS PRINT QUESTION QUESTION_MARK RECORD_FILL REDO REPEAT_START REST REST_8TH " +
    "REWIND REWIND_END_FILL REWIND_START_FILL RE_PITCH RHYTHM_ONLY RIGHT_GAP RIGHT_MARGIN SAVE " +
    "SCORE SEARCH SECTION_BREAK SECTION_BREAK2 SETTINGS_COG SHARE_AUDIO SHARE_FILE SHARP " +
    "SHARP_DOUBLE SHORTCUTS SHOW_EMPTY_STAVES SILENCE_AUDIO_SELECTION SINGLE_NOTE SLUR " +
    "SMALL_ARROW_DOWN SMALL_ARROW_LEFT SMALL_ARROW_RIGHT SMALL_ARROW_UP SOLO SPACER SPECTROGRAM " +
    "SPECTROGRAM_BOX_SELECTION SPLIT_OUT_ARROWS SPLIT_TOOL SPLIT_VIEW_HORIZONTAL " +
    "SPLIT_VIEW_VERTICAL STACCATO STAFF_TYPE_CHANGE STAR STOP STOP_FILL SYSTEM_LOCK " +
    "SYSTEM_LOCK_END SYSTEM_LOCK_START TAPPING_DOT TAPPING_ENCIRCLED_T TAPPING_PLUS TAPPING_T " +
    "TEMPO_CHANGE TENUTO TEXT_ABOVE_STAFF TEXT_ALIGN_BASELINE TEXT_ALIGN_BOTTOM TEXT_ALIGN_CENTER " +
    "TEXT_ALIGN_JUSTIFY TEXT_ALIGN_LEFT TEXT_ALIGN_MIDDLE TEXT_ALIGN_RIGHT TEXT_ALIGN_TOP " +
    "TEXT_BELOW_STAFF TEXT_BOLD TEXT_FRAME TEXT_ITALIC TEXT_STRIKE TEXT_SUBSCRIPT " +
    "TEXT_SUPERSCRIPT TEXT_UNDERLINE TICK TICK_RIGHT_ANGLE TICK_RIGHT_ANGLE_THICK " +
    "TIE_CHORD_INSIDE TIE_CHORD_OUTSIDE TIE_INSIDE TIE_OUTSIDE TIMESIG_NARROW TIMESIG_SANSSERIF " +
    "TIME_SIGNATURE TOOLBAR_GRIP TOP_MARGIN TREMOLO_ONE_NOTE TREMOLO_STYLE_DEFAULT " +
    "TREMOLO_STYLE_TRADITIONAL TREMOLO_STYLE_TRADITIONAL_ALTERNATE TREMOLO_TWO_NOTES " +
    "TRIANGLE_SYMBOL TRIM_AUDIO_OUTSIDE_SELECTION TUNING_FORK TUPLET_GRAPHICAL_CENTER " +
    "TUPLET_NUMBER_ONLY TUPLET_NUMBER_WITH_BRACKETS TUPLET_RYTHMIC_CENTER UNDO UP UPDATE " +
    "USE_WIDE_BEAMS_REGULAR USE_WIDE_BEAMS_WIDE VERTICAL VERTICAL_FRAME VIBRATO VIDEO VOICE_1 " +
    "VOICE_2 VOICE_3 VOICE_4 VOLTA WARNING WARNING_SMALL WAVEFORM WORKSPACE ZOOM_IN ZOOM_OUT " +
    "ZOOM_TOGGLE"
).trim().split(" ");

// Of those, the ones the enum did not have in 4.4.0, with the release that introduced each.
// The enum only ever grows, so everything not listed here has been there since 4.4.0.
var ADDED_AFTER_4_4 = {};
(
    "ALIGN_HORIZONTAL_CENTER:4.5 ALIGN_LEFT:4.5 ALIGN_RIGHT:4.6 ALIGN_TOP:4.5 " +
    "ALIGN_VERTICAL_CENTER:4.5 AUDIO_COM_LOGO:4.6 CHORD_BASS_ALIGN:4.6 DOUBLE_BAR_LINE:4.6 " +
    "DURATION_CURSOR:4.5 EYE_OPEN_THICK:4.6 FILLED_ARROW_LEFT:4.7 FILLED_ARROW_RIGHT:4.7 " +
    "FRACTION_DIAGONAL:4.7 FRACTION_LEVEL:4.7 FRET_FRAME:4.6 GUITAR_DIP_DOWN:4.7 " +
    "GUITAR_DIP_UP:4.7 GUITAR_DIVE_REGULAR:4.7 GUITAR_PRE_DIVE:4.7 GUITAR_SCOOP:4.7 " +
    "HIDE_EMPTY_STAVES:4.6 HP_LOWER_CASE:4.6 HP_UPPER_CASE:4.6 INSIGHT:4.6 LINE_ARROW_LEFT:4.7 " +
    "LINE_ARROW_RIGHT:4.7 LINE_BREAK:4.5 LV_CHORD_INSIDE:4.5 LV_CHORD_OUTSIDE:4.5 LV_INSIDE:4.5 " +
    "LV_OUTSIDE:4.5 MAGNET:4.5 MUSESCORE_COM_LOGO:4.6 NOTE_ALIGN_CENTER:4.6 NOTE_ALIGN_LEFT:4.6 " +
    "NOTE_ALIGN_RIGHT:4.6 NOTE_ANCHORED_LINE:4.5 NOTE_LV:4.5 NO_BREAK:4.5 PAGE_BREAK:4.5 " +
    "PERCUSSION:4.5 PLAYHEAD:4.5 PLAYHEAD_FILLED:4.5 SECTION_BREAK2:4.5 SHOW_EMPTY_STAVES:4.6 " +
    "SINGLE_NOTE:4.5 SPLIT_TOOL:4.6 SYSTEM_LOCK:4.5 SYSTEM_LOCK_END:4.5 SYSTEM_LOCK_START:4.5 " +
    "TAPPING_DOT:4.6 TAPPING_ENCIRCLED_T:4.6 TAPPING_PLUS:4.6 TAPPING_T:4.6 " +
    "TEXT_ALIGN_JUSTIFY:4.7 TICK_RIGHT_ANGLE_THICK:4.6 TIMESIG_NARROW:4.5 TIMESIG_SANSSERIF:4.5 " +
    "TUPLET_GRAPHICAL_CENTER:4.6 TUPLET_RYTHMIC_CENTER:4.6 VIDEO:4.7 WARNING_SMALL:4.6 " +
    "WORKSPACE:4.6"
).trim().split(" ").forEach(function(pair) {
    var parts = pair.split(":");
    ADDED_AFTER_4_4[parts[0]] = parts[1];
});

// An icon added after 4.4.0 draws nothing on the versions that predate it, which is the blank
// button again for anyone who has not updated. README and MARKETPLACE say 4.4 through 4.7, so
// using one is a decision about who sees a toolbar button, and it belongs here in writing
// rather than in a name nobody checked. Each entry is the release the icon arrived in.
var ACCEPTED_WITHOUT_4_4 = {
    // Chosen for its drawing, a chord chart frame, over FRETBOARD_DIAGRAM which goes back to
    // 4.4. On 4.4 and 4.5 the toolbar button is blank, the Extensions menu is unaffected.
    "FRET_FRAME": "4.6"
};

test("every action names an icon MuseScore can resolve", function() {
    assert.ok(manifest.actions.length > 0, "the manifest declares at least one action");

    for (var i = 0; i < manifest.actions.length; i++) {
        var action = manifest.actions[i];
        assert.ok(ICON_CODES.indexOf(action.icon) >= 0,
            "action " + action.code + " asks for the icon " + JSON.stringify(action.icon) +
            ", which is not a name of IconCode::Code, so MuseScore draws a blank button");
    }
});

test("an icon newer than the oldest MuseScore supported is one we decided to use", function() {
    for (var i = 0; i < manifest.actions.length; i++) {
        var action = manifest.actions[i];
        var arrived = ADDED_AFTER_4_4[action.icon];
        if (!arrived) continue;
        assert.equal(ACCEPTED_WITHOUT_4_4[action.icon], arrived,
            "action " + action.code + " uses " + action.icon + ", which MuseScore added in " +
            arrived + ", so the button is blank on everything older. Either pick an icon from " +
            "4.4.0 or record the choice in ACCEPTED_WITHOUT_4_4.");
    }
});

test("an action that is put on the toolbar is the one carrying the icon", function() {
    // Only the toolbar draws the icon, so an action shown there without one is the case
    // above. One that is not shown is reached through the Extensions menu, by title.
    for (var i = 0; i < manifest.actions.length; i++) {
        var action = manifest.actions[i];
        if (!action.show_on_toolbar) continue;
        assert.ok(action.icon, "action " + action.code + " is on the toolbar with no icon");
    }
});

test("every action points at a file that is there", function() {
    for (var i = 0; i < manifest.actions.length; i++) {
        var p = manifest.actions[i].path;
        assert.ok(fs.existsSync(path.join(BASE, p)), p + " is missing");
    }
});

test("the thumbnail the extensions list shows is there", function() {
    assert.ok(manifest.thumbnail, "the manifest names a thumbnail");
    assert.ok(fs.existsSync(path.join(BASE, manifest.thumbnail)),
        manifest.thumbnail + " is missing, so the extensions list falls back to a placeholder");
});
