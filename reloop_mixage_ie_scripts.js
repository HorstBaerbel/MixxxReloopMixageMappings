// Name: Reloop Mixage IE
// Author: Bim Overbohm
// Version: 1.0.0, needs Mixxx 2.1+

var MixageIE = {};

MixageIE.updateVUMetersTimer = 0;
MixageIE.libraryHideTimer = 0;
MixageIE.libraryReducedHideTimeout = 500;
MixageIE.libraryHideTimeout = 4000;
MixageIE.libraryRemainingTime = 0;
MixageIE.scratchPressed = false;
MixageIE.scrollPressed = false;
MixageIE.scratchByWheelTouch = false;
MixageIE.beatMovePressed = false;
MixageIE.effectRackSelected = [[true, false], [true, false]]; // if effect rack 1/2 is selected for channel 1/2
MixageIE.effectRackEnabled = [false, false]; // if effect rack 1/2 is enabled for channel 1/2

MixageIE.init = function (id, debugging) {
	MixageIE.connectControlsToFunctions('[Channel1]');
	MixageIE.connectControlsToFunctions('[Channel2]');
	// all buttons off
	for (var i = 0; i < 255; i++) {
		midi.sendShortMsg(0x90, i, 0);
	}
	// start timers for updating the VU meters
	MixageIE.updateVUMetersTimer = engine.beginTimer(33, MixageIE.updateVUMeters);
	engine.scratchDisable(1);
	engine.scratchDisable(2);
	// disable effects for both channels
	engine.setValue('[EffectRack1_EffectUnit1]', 'group_[Channel1]_enable', false);
	engine.setValue('[EffectRack1_EffectUnit2]', 'group_[Channel1]_enable', false);
	engine.setValue('[EffectRack1_EffectUnit1]', 'group_[Channel2]_enable', false);
	engine.setValue('[EffectRack1_EffectUnit2]', 'group_[Channel2]_enable', false);
}

MixageIE.shutdown = function () {
	engine.stopTimer(MixageIE.updateVUMetersTimer);
	MixageIE.setLibraryMaximized(false);
	MixageIE.connectControlsToFunctions('[Channel1]', true);
	MixageIE.connectControlsToFunctions('[Channel2]', true);
	// all button LEDs off
	for (var i = 0; i < 255; i++) {
		midi.sendShortMsg(0x90, i, 0);
	}
}

// Maps channels and their controls to a MIDI control number to toggle their LEDs
MixageIE.ledMap = {
	'[Channel1]': {
		'cue_indicator': 0x0A,
		'cue_default': 0x0B,
		'play_indicator': 0x0C,
		'pfl': 0x0E,
		'loop_enabled': 0x06,
		'sync_enabled': 0x09,
		'master_on': 0x07,
		'fx_on': 0x08
	},
	'[Channel2]': {
		'cue_indicator': 0x18,
		'cue_default': 0x19,
		'play_indicator': 0x1A,
		'pfl': 0x1C,
		'loop_enabled': 0x14,
		'sync_enabled': 0x17,
		'master_on': 0x15,
		'fx_on': 0x16
	}
};

// Maps mixxx controls to a function that toggles their LEDs
MixageIE.connectionMap = {
	'cue_indicator': 'MixageIE.toggleLED',
	'cue_default': 'MixageIE.toggleLED',
	'play_indicator': 'MixageIE.handlePlay',
	'pfl': 'MixageIE.toggleLED',
	'loop_enabled': 'MixageIE.toggleLED',
	'sync_enabled': 'MixageIE.toggleLED'
};

// Set or remove functions to call when the state of a mixxx control changes
MixageIE.connectControlsToFunctions = function (group, remove) {
	remove = (typeof remove !== 'undefined') ? remove : false;
	for (var control in MixageIE.connectionMap) {
		engine.connectControl(group, control, MixageIE.connectionMap[control], remove)
		if (!remove) {
			engine.trigger(group, control)
		}
	}
}

// Toggle the LED on the MIDI controller by sending a MIDI message
MixageIE.toggleLED = function (value, group, control) {
	midi.sendShortMsg(0x90, MixageIE.ledMap[group][control], (value === 1) ? 0x7F : 0);
}

MixageIE.updateVUMeters = function () {
	midi.sendShortMsg(0x90, 29, engine.getValue('[Channel1]', 'VuMeter') * 7);
	midi.sendShortMsg(0x90, 30, engine.getValue('[Channel2]', 'VuMeter') * 7);
}

// Toggle the LED on play button and make sure the preview deck stops when starting to play in a deck
MixageIE.handlePlay = function (value, group, control) {
	MixageIE.toggleLED(value, group, control);
	engine.setValue('[PreviewDeck1]', 'stop', true);
}

// Helper function to scroll the playlist
MixageIE.scrollLibrary = function (value) {
	MixageIE.setLibraryMaximized(true);
	//engine.setValue('[Library]', 'MoveVertical', value);
	engine.setValue('[Playlist]', 'SelectTrackKnob', value); // for Mixxx < 2.1
}

// A button for the playlist was pressed
MixageIE.handleLibrary = function (channel, control, value, status, group) {
	// "push2browse" button was moved somehow 
	if (control === 0x1F) {
		// "push2browse" button was pushed
		if (status == 0x90 && value === 0x7F) {
			MixageIE.setLibraryMaximized(true);
			// stop the currently playing track. if it wasn't playing, start it
			if (engine.getValue('[PreviewDeck1]', 'play')) {
				engine.setValue('[PreviewDeck1]', 'stop', true);
			}
			else {
				engine.setValue('[PreviewDeck1]', 'LoadSelectedTrackAndPlay', true);
			}
		}
		// "push2browse" button was turned 
		else if (status === 0xB0) {
			var newValue = value - 64;
			MixageIE.scrollLibrary(newValue);
		}
	}
	// load into deck 1
	else if (control === 0x0D || control === 0x4C) {
		if (value === 0x7F) {
			engine.setValue('[PreviewDeck1]', 'stop', true);
			engine.setValue('[Channel1]', control === 0x4C ? 'LoadSelectedTrackAndPlay' : 'LoadSelectedTrack', true);
			MixageIE.libraryRemainingTime = MixageIE.libraryReducedHideTimeout;
		}
	}
	// load into deck 2
	else if (control === 0x1B || control === 0x5A) {
		if (value === 0x7F) {
			engine.setValue('[PreviewDeck1]', 'stop', true);
			engine.setValue('[Channel2]', control === 0x5A ? 'LoadSelectedTrackAndPlay' : 'LoadSelectedTrack', true);
			MixageIE.libraryRemainingTime = MixageIE.libraryReducedHideTimeout;
		}
	}
}

// Set the library visible and hide it when libraryHideTimeOut is reached
MixageIE.setLibraryMaximized = function (visible) {
	if (visible === true) {
		MixageIE.libraryRemainingTime = MixageIE.libraryHideTimeout;
		// maximize library if not maximized already
		if (engine.getValue('[Master]', 'maximize_library') !== true) {
			engine.setValue('[Master]', 'maximize_library', true);
			if (MixageIE.libraryHideTimer === 0) {
				// timer not running. start it
				MixageIE.libraryHideTimer = engine.beginTimer(MixageIE.libraryHideTimeout / 5, MixageIE.libraryCheckTimeout);
			}
		}
	}
	else {
		if (MixageIE.libraryHideTimer !== 0) {
			engine.stopTimer(MixageIE.libraryHideTimer);
			MixageIE.libraryHideTimer = 0;
		}
		MixageIE.libraryRemainingTime = 0;
		engine.setValue('[Master]', 'maximize_library', false);
	}
}

MixageIE.libraryCheckTimeout = function () {
	MixageIE.libraryRemainingTime -= MixageIE.libraryHideTimeout / 5;
	if (MixageIE.libraryRemainingTime <= 0) {
		engine.stopTimer(MixageIE.libraryHideTimer);
		MixageIE.libraryHideTimer = 0;
		MixageIE.libraryRemainingTime = 0;
		engine.setValue('[Master]', 'maximize_library', false);
	}
}

// The "record" button that enables/disables scratching
MixageIE.scratchActive = function (channel, control, value, status, group) {
	// calculate deck number from MIDI control. 0x04 controls deck 1, 0x12 deck 2
	var deckNr = control === 0x04 ? 1 : 2;
	if (value === 0x7F) {
		MixageIE.scratchPressed = true;
		var alpha = 1.0 / 8.0;
		var beta = alpha / 32.0;
		engine.scratchEnable(deckNr, 620, 20.0/*33.0+1.0/3.0*/, alpha, beta);
	} else {
		MixageIE.scratchPressed = false;
		engine.scratchDisable(deckNr);
	}
}

// The "magnifying glass" button that enables/disables playlist scrolling
MixageIE.scrollActive = function (channel, control, value, status, group) {
	// calculate deck number from MIDI control. 0x04 controls deck 1, 0x12 deck 2
	var deckNr = control === 0x03 ? 1 : 2;
	MixageIE.scrollPressed = value === 0x7F;
	if (MixageIE.scrollPressed) {
		MixageIE.setLibraryMaximized(true);
	}
}

// The touch function on the wheels that enables/disables scratching
MixageIE.wheelTouch = function (channel, control, value, status, group) {
	// check if scratching through wheel touch is enabled
	if (MixageIE.scratchByWheelTouch) {
		// calculate deck number from MIDI control. 0x24 controls deck 1, 0x25 deck 2
		var deckNr = control - 0x24 + 1;
		if (value === 0x7F) {
			var alpha = 1.0 / 8;
			var beta = alpha / 32.0;
			engine.scratchEnable(deckNr, 620, 33.0 + 1.0 / 3.0, alpha, beta);
		} else {
			engine.scratchDisable(deckNr);
		}
	}
}

// The wheel that actually controls the scratching / jogging
MixageIE.wheelTurn = function (channel, control, value, status, group) {
	// calculate deck number from MIDI control. 0x24 controls deck 1, 0x25 deck 2
	var deckNr = control - 0x24 + 1;
	// Control centers on 0x40 (64), calculate difference to that value
	var newValue = value - 64;
	// In either case, register the movement
	if (MixageIE.scratchPressed) {
		engine.scratchTick(deckNr, newValue); // scratch
	}
	else {
		engine.scratchDisable(deckNr);
	}
	if (MixageIE.scrollPressed) {
		MixageIE.scrollLibrary(newValue);
	}
	//engine.setValue('[Channel'+deckNr+']', 'jog', newValue); // Pitch bend
}

// The MASTER button that toggles routing master through effects
MixageIE.handleEffectMasterOn = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x46 controls unit 1, 0x54 unit 2
	var unitNr = control === 0x46 ? 1 : 2;
	// react only on first message / keydown
	if (value === 0x7F) {
		// check and toggle enablement
		var controlString = '[EffectRack1_EffectUnit' + unitNr + ']';
		var keyString = 'group_[Master]_enable';
		var isEnabled = !engine.getValue(controlString, keyString);
		engine.setValue(controlString, keyString, isEnabled);
		MixageIE.toggleLED(isEnabled ? 1 : 0, '[Channel' + unitNr + ']', 'master_on');
	}
}

// The FX ON button that toggles routing channel 1/2 through effects
MixageIE.handleEffectChannelOn = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x08 controls unit 1, 0x16 unit 2
	var unitNr = control === 0x08 ? 1 : 2;
	// react only on first message / keydown
	if (value === 0x7F) {
		// check and toggle enablement
		MixageIE.effectRackEnabled[unitNr - 1] = !MixageIE.effectRackEnabled[unitNr - 1];
		var isEnabled = MixageIE.effectRackEnabled[unitNr - 1];
		// update controls
		var keyString = 'group_[Channel' + unitNr + ']_enable';
		engine.setValue('[EffectRack1_EffectUnit1]', keyString, isEnabled && MixageIE.effectRackSelected[unitNr - 1][0]);
		engine.setValue('[EffectRack1_EffectUnit2]', keyString, isEnabled && MixageIE.effectRackSelected[unitNr - 1][1]);
		MixageIE.toggleLED(isEnabled ? 1 : 0, '[Channel' + unitNr + ']', 'fx_on');
	}
}

// The FX SEL button that selects which effects are enabled for channel 1/2
MixageIE.handleEffectChannelSelect = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x07 controls unit 1, 0x15 unit 2
	var unitNr = control === 0x07 ? 1 : 2;
	// react only on first message / keydown
	if (value === 0x7F) {
		// check and toggle select state
		var selected1 = MixageIE.effectRackSelected[unitNr - 1][0];
		var selected2 = MixageIE.effectRackSelected[unitNr - 1][1];
		if (selected1 && selected2) {
			selected1 = true;
			selected2 = false;
		}
		else if (selected1) {
			selected1 = false;
			selected2 = true;
		}
		else {
			selected1 = true;
			selected2 = true;
		}
		MixageIE.effectRackSelected[unitNr - 1][0] = selected1;
		MixageIE.effectRackSelected[unitNr - 1][1] = selected2;
		// update controls
		var isEnabled = MixageIE.effectRackEnabled[unitNr - 1];
		var keyString = 'group_[Channel' + unitNr + ']_enable';
		engine.setValue('[EffectRack1_EffectUnit1]', keyString, isEnabled && MixageIE.effectRackSelected[unitNr - 1][0]);
		engine.setValue('[EffectRack1_EffectUnit2]', keyString, isEnabled && MixageIE.effectRackSelected[unitNr - 1][1]);
	}
}

MixageIE.handleEffectDryWet = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x21 controls unit 1, 0x25 unit 2
	var unitNr = control === 0x21 ? 1 : 2;
	// Control centers on 0x40 (64), calculate difference to that value and multiply by 4
	var diff = (value - 64) / 10.0;
	// In either case, register the movement
	var controlString = '[EffectRack1_EffectUnit' + unitNr + ']';
	var value = engine.getValue(controlString, 'mix');
	engine.setValue(controlString, 'mix', value + diff);
}

// The PAN rotatry control used here for the overall effect super control
MixageIE.handleEffectSuper = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x60 controls unit 1, 0x62 unit 2
	var unitNr = control === 0x60 ? 1 : 2;
	// Control centers on 0x40 (64), calculate difference to that value and multiply by 4
	var diff = (value - 64) / 10.0;
	// In either case, register the movement
	var controlString = '[EffectRack1_EffectUnit' + unitNr + ']';
	var value = engine.getValue(controlString, 'super1');
	engine.setValue(controlString, 'super1', value + diff);
}

MixageIE.handleBeatMovePressed = function (channel, control, value, status, group) {
	MixageIE.beatMovePressed = value === 0x7f;
}

MixageIE.handleBeatMoveLength = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x20 controls unit 1, 0x22 unit 2
	var unitNr = control === 0x20 ? 1 : 2;
	var moveDirection = unitNr == 1 ? 1 : -1;
	// Control centers on 0x40 (64), calculate difference to that
	var diff = (value - 64);
	// In either case, register the movement
	if (MixageIE.beatMovePressed) {
		var value = engine.getParameter('[Channel' + unitNr + ']', 'beatjump_size');
		value = moveDirection * diff > 0 ? 2 * value : value / 2;
		engine.setParameter('[Channel' + unitNr + ']', 'beatjump_size', value);
	}
	else {
		var direction = moveDirection * diff > 0 ? 'loop_double' : 'loop_halve';
		engine.setValue('[Channel' + unitNr + ']', direction, true);
	}
}

MixageIE.handleBeatMove = function (channel, control, value, status, group) {
	// calculate effect unit number from MIDI control. 0x5f controls unit 1, 0x61 unit 2
	var unitNr = control === 0x5f ? 1 : 2;
	var moveDirection = unitNr == 1 ? 1 : -1;
	// Control centers on 0x40 (64), calculate difference to that
	var diff = (value - 64);
	// In either case, register the movement
	var direction = moveDirection * diff > 0 ? 'beatjump_forward' : 'beatjump_backward';
	engine.setValue('[Channel' + unitNr + ']', direction, true);
}
