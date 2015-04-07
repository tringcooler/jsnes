
function cmp_dp(o1, o2, pn) {
	var fn = function(k) {
		return (pn&&pn+'.'||'')+k;
	};
	var rand_flag = Math.random();
	for(k in o1) {
		if(o1.hasOwnProperty(k)) {
			if(o2.hasOwnProperty(k)) {
				if(o1[k] !== o2[k]) {
					if(o1[k] && o2[k] && typeof(o1[k]) == 'object' && typeof(o2[k]) == 'object') {
						if(o1[k].__cmpdp_flag == rand_flag || o2[k].__cmpdp_flag == rand_flag) {
							console.log(fn(k), o1[k], o2[k], '--LOOP--');
						} else {
							o1[k].__cmpdp_flag = rand_flag;
							o2[k].__cmpdp_flag = rand_flag;
							cmp_dp(o1[k], o2[k], fn(k));
						}
					} else {
						console.log(fn(k), o1[k], o2[k]);
					}
				}
			} else {
				console.log(fn(k), o1[k], '--NONE--');
			}
		}
	}
	for(k in o2) {
		if(o2.hasOwnProperty(k)) {
			if(!o1.hasOwnProperty(k)) {
				console.log(fn(k), '--NONE--', o2[k]);
			}
		}
	}
}

function make_dummy(dest, base, getter, setter) {
	for(var k in base) {
		dest.__defineGetter__(k, getter.bind(dest, base, k));
		dest.__defineSetter__(k, setter.bind(dest, base, k));
	}
}

var _logcnt = (function() {
	function _logcnt() {
		this._log = {};
	}
	_logcnt.prototype.cnt = function(ks) {
		var tar = this._log;
		for(var i = 0; i < ks.length - 1; i++) {
			if(!(ks[i] in tar)) {
				tar[ks[i]] = {};
			}
			tar = tar[ks[i]];
		}
		if(!(ks[i] in tar)) {
			tar[ks[i]] = 0;
		}
		tar[ks[i]] ++ ;
	};
	_logcnt.prototype.show = function(tar, t) {
		if(tar == undefined) {
			tar = this._log;
			this._log = {};
			t = 0;
		}
		for(var k in tar) {
			var s = new Array(t+1).join('  ');
			s += k + ': ';
			if(typeof(tar[k]) == 'number') {
				s += tar[k];
				console.log(s);
			} else {
				console.log(s);
				this.show(tar[k], t+1);
			}
		}
	};
	return _logcnt;
})();

var PPU_DUMMY = (function(PPU) {
	function PPU_DUMMY(nes) {
		this._logcnt = new _logcnt;
		make_dummy(this, new PPU(nes), __getattr__, __setattr__);
	}
	for(var k in PPU) {
		if(PPU.hasOwnProperty(k)) {
			(function(){
				var _k = k;
				var _f = function(args) {
					PPU[_k].apply(this, args);
				};
				_f.prototype = PPU[_k].prototype;
				PPU_DUMMY[_k] = function() {
					this._logcnt = new _logcnt;
					make_dummy(this, new _f(arguments), __getattr__, __setattr__);
				}
			})();
		}
	}
	var __getattr__ = function (base, key) {
		this._logcnt.cnt([key, 'get']);
		return base[key];
	};
	var __setattr__ = function (base, key, val) {
		this._logcnt.cnt([key, 'set']);
		base[key] = val;
	};
	return PPU_DUMMY;
})(JSNES.PPU);

for(var i = 0; i < 5; i ++) {
	if(i == 3) i = 4;
	JSNES.Mappers[i] = (function(_super) {
		__extends(MMAP_EXT, _super);
		function MMAP_EXT(nes) {
			_super.call(this, nes);
			this._log = new _logcnt;
			this._pack = [];
			this._hook = true;
		}
		MMAP_EXT.prototype.regLoad = function(addr) {
			if(this._hook) {
				if(addr >> 13 == 1 || addr == 0x4014) {
					this._log.cnt([addr.toString(16), 'load']);
				}
				if(addr == 0x2007) {
					this._pack.push([this.nes.ppu.scanline, 'l', addr]);
				}
			}
			return _super.prototype.regLoad.call(this, addr);
		};
		MMAP_EXT.prototype.regWrite = function(addr, val) {
			if(this._hook) {
				if(addr >> 13 == 1 || addr == 0x4014) {
					this._log.cnt([addr.toString(16), 'write']);
				}
				if(addr >> 13 == 1) {
					this._pack.push([this.nes.ppu.scanline, 'w', addr, val]);
				} else if(addr == 0x4014) {
					var baseaddr = val * 0x100;
					var data = this.nes.cpu.mem.slice(baseaddr, baseaddr + 256);
					this._pack.push([this.nes.ppu.scanline, 'd', val, data]);
				}
			}
			return _super.prototype.regWrite.call(this, addr, val);
		};
		return MMAP_EXT;
	})(JSNES.Mappers[i]);
}

var JSNES_EXT_CPU = (function(_super) {
	__extends(JSNES_EXT_CPU, _super);
	function JSNES_EXT_CPU(opts) {
		_super.call(this, opts);
		this._tp = 'cpu';
	}
	JSNES_EXT_CPU.prototype.start = function() {
		this.keyboard.connect(1);
		_super.prototype.start.call(this);
	};
	JSNES_EXT_CPU.prototype.frame = function() {
        this.ppu.startFrame();
        var cycles = 0;
		var cyc_all = 0;
        var emulateSound = this.opts.emulateSound;
        var cpu = this.cpu;
        var ppu = this.ppu;
        var papu = this.papu;
        FRAMELOOP: for (;;) {
            if (cpu.cyclesToHalt === 0) {
                // Execute a CPU instruction
                cycles = cpu.emulate();
                if (emulateSound) {
                    papu.clockFrameCounter(cycles);
                }
                cycles *= 3;
            }
            else {
                if (cpu.cyclesToHalt > 8) {
                    cycles = 24;
                    if (emulateSound) {
                        papu.clockFrameCounter(8);
                    }
                    cpu.cyclesToHalt -= 8;
                }
                else {
                    cycles = cpu.cyclesToHalt * 3;
                    if (emulateSound) {
                        papu.clockFrameCounter(cpu.cyclesToHalt);
                    }
                    cpu.cyclesToHalt = 0;
                }
            }
			cyc_all += cycles;
            
            for (; cycles > 0; cycles--) {
                if(ppu.curX === ppu.spr0HitX &&
                        ppu.f_spVisibility === 1 &&
                        ppu.scanline - 21 === ppu.spr0HitY) {
                    // Set sprite 0 hit flag:
                    ppu.setStatusFlag(ppu.STATUS_SPRITE0HIT, true);
                }

                if (ppu.requestEndFrame) {
                    ppu.nmiCounter--;
                    if (ppu.nmiCounter === 0) {
                        ppu.requestEndFrame = false;
                        ppu.startVBlank();
						g_pipe.send({
							cyc: cyc_all, 
							seq: this.mmap._pack,
						}, 'ppu_send');
						this.mmap._pack = [];
                        break FRAMELOOP;
                    }
                }

                ppu.curX++;
                if (ppu.curX === 341) {
                    ppu.curX = 0;
                    ppu.endScanline();
                }
            }
        }
        this.fpsFrameCount++;
        this.lastFrameTime = +new Date();
    };
	return JSNES_EXT_CPU;
})(JSNES);

var JSNES_EXT_PPU = (function(_super) {
	__extends(JSNES_EXT_PPU, _super);
	function JSNES_EXT_PPU(opts) {
		_super.call(this, opts);
		this._tp = 'ppu';
	}
	JSNES_EXT_PPU.prototype.start = function() {
        var self = this;
        
        if (this.rom !== null && this.rom.valid) {
            if (!this.isRunning) {
                this.isRunning = true;
                
				g_pipe.reg(this._recv_hndl.bind(this), 'ppu_pipe');
				g_pipe.add_tags('ppu_pipe', 'ppu_recv');
				this.keyboard.connect(2);
				this.mmap._hook = false;
                this.resetFps();
                this.printFps();
                this.fpsInterval = setInterval(function() {
                    self.printFps();
                }, this.opts.fpsInterval);
            }
        }
        else {
            this.ui.updateStatus("There is no ROM loaded, or it is invalid.");
        }
    };
	JSNES_EXT_PPU.prototype.stop = function() {
        clearInterval(this.fpsInterval);
        this.isRunning = false;
    };
	JSNES_EXT_PPU.prototype._recv_hndl = function(info) {
		var info_idx = 0;
		var cycles = info.cyc;
		this.ppu.startFrame();
        var ppu = this.ppu;
            
		for (; cycles > 0; cycles--) {
			
			if(ppu.curX === ppu.spr0HitX &&
					ppu.f_spVisibility === 1 &&
					ppu.scanline - 21 === ppu.spr0HitY) {
				// Set sprite 0 hit flag:
				ppu.setStatusFlag(ppu.STATUS_SPRITE0HIT, true);
			}
			
			if(info_idx < info.seq.length) {
				var itm = info.seq[info_idx];
				var scl = itm[0];//[0];
				//var curx = itm[0][1];
				if(ppu.scanline == scl /*&& ppu.curX == curx*/) {
					if(itm[1] == 'w') {
						var addr = itm[2];
						var val = itm[3];
						this.mmap.regWrite(addr, val);
					} else if(itm[1] == 'd') {
						var val = itm[2];
						var data = itm[3];
						var baseaddr = val * 0x100;
						Array.prototype.splice.apply(this.cpu.mem, [baseaddr, 256].concat(data));
						this.mmap.regWrite(0x4014, val);
					} else if(itm[1] == 'l') {
						var addr = itm[2];
						this.mmap.regLoad(addr);
					}
					info_idx ++;
				}
			}
			
			if (ppu.requestEndFrame) {
				ppu.nmiCounter--;
				if (ppu.nmiCounter === 0) {
					ppu.requestEndFrame = false;
					ppu.startVBlank();
					this.fpsFrameCount++;
					this.lastFrameTime = +new Date();
					return;
				}
			}

			ppu.curX++;
			if (ppu.curX === 341) {
				ppu.curX = 0;
				ppu.endScanline();
			}
		}
	};
	return JSNES_EXT_PPU;
})(JSNES);

JSNES.Keyboard = (function(_super) {
	__extends(KEYBOARD_EXT, _super);
	function KEYBOARD_EXT() {
		_super.call(this);
		this.keymap = {
			88: this.keys.KEY_A,
			90: this.keys.KEY_B,
			17: this.keys.KEY_SELECT,
			13: this.keys.KEY_START,
			38: this.keys.KEY_UP,
			40: this.keys.KEY_DOWN,
			37: this.keys.KEY_LEFT,
			39: this.keys.KEY_RIGHT,
		};
	}
	KEYBOARD_EXT.prototype.connect = function(pad) {
		this.pad = pad;
		if(pad == 1) {
			g_pipe.reg(this._recv_hndl.bind(this), 'pad_pipe');
			g_pipe.add_tags('pad_pipe', 'pad_recv');
		}
	};
	KEYBOARD_EXT.prototype._recv_hndl = function(info) {
		this.state2[info[0]] = info[1];
	};
	KEYBOARD_EXT.prototype.setKey = function(key, value) {
		if(!(key in this.keymap)) return true;
		this.state1[this.keymap[key]] = value;
		if(this.pad == 2) {
			g_pipe.send([this.keymap[key], value], 'pad_send');
		}
        return false; // preventDefault
    };
	return KEYBOARD_EXT;
})(JSNES.Keyboard);


//JSNES = JSNES_EXT_CPU;
//JSNES.PPU = PPU_DUMMY;

var game_nes = (function(_super) {
	__extends(game_nes, _super);
	function game_nes(sheet, pipe) {
		_super.call(this, sheet);
		this.pipe = pipe;
		$('#start_button', this.element).click(this.start.bind(this));
		this.pipe.reg(this._cmd_cb.bind(this), 'nes_cmd_channel');
		this.pipe.add_tags('nes_cmd_channel', 'peerrecv_nes_cmd');
	}
	game_nes.prototype._class = 'game_nes';
	game_nes.prototype._conf_intf = {
		"name": "form",
		"elem": "div",
		"chld": [{
			"name": "button",
			"elem": "input",
			"attr": {
				"type": "button",
				"id": "start_button",
				"value": "Start",
			},
		}, {
			"name": "emulator",
			"elem": "div",
			"attr": {
				"id": "emulator",
			},
		}],
	};
	game_nes.prototype.start = function() {
		if(!this._peer_init()) return;
		this._nes_init();
	};
	game_nes.prototype._nes_init = function() {
		var jsnes;
		if(this._host)
			jsnes = JSNES_EXT_CPU;
		else
			jsnes = JSNES_EXT_PPU;
		this.nes = new jsnes({
			'ui': $('#emulator').JSNESUI({
				"Homebrew": [
					['Concentration Room', 'roms/croom/croom.nes'],
					['LJ65', 'roms/lj65/lj65.nes'],
				],
			})
		});
		$('div.nes-roms select').prop('selectedIndex', 2);
		this.nes.ui.loadROM();
	};
	game_nes.prototype._peer_init = function() {
		if(this._peer_cmd('count') > 2) {
			this.pipe.send('This game is only for 2 players.', 'console_info');
			return false;
		}
		if(this._host == undefined)
			this._host = true;
		var peers = this._peer_lock();
		if(peers.cnt == 1) {
			this._remote = false;
			return true;
		}
		this._remote = true;
		this._started = true;
		this._send_seq = 0;
		this._recv_seq = 0;
		this.pipe.reg(this._recv_cb.bind(this), 'nes_game_channel');
		this.pipe.add_tags('nes_game_channel', 'peerrecv_nes_game');
		this.pipe.reg(this._send_cb.bind(this), 'nes_local_channel');
		this.pipe.add_tags('nes_local_channel', ['ppu_send', 'pad_send']);
		this.pipe.send({
			"cmd": "start",
			"rom": "t01.nes",
		}, ['peersend_nes_cmd', 'peerid_all', 'peer_send']);
		return true;
	};
	game_nes.prototype._peer_lock = function() {
		var retry = 0;
		return this._peer_cmd('lock', (function(pid) {
			if(this._started && this._host) {
				if(retry > 5) {
					this.pipe.send('Error: Reconnect faild (Out of time).', 'console_info');
					return false;
				}
				this._peer_cmd('onshake', 'reconnect', (function(pid, user) {
					this.pipe.send({
						"cmd": "reconnect",
						"send_seq": this._send_seq,
						"recv_seq": this._recv_seq,
					}, ['peersend_nes_cmd', 'peerid_all', 'peer_send']);
					retry = 0;
				}).bind(this), false);
				this._peer_cmd('connect', pid);
				retry++;
				return true;
			}
		}).bind(this));
	};
	game_nes.prototype._cmd2data = function(args) {
		var data = {
			"cmd": args[0],
			"args": Array.prototype.slice.call(args, 1),
		};
		return data;
	};
	game_nes.prototype._peer_cmd = function() {
		return this.pipe.quick(this._cmd2data(arguments), 'peer_cmd', 'peer_cmd_result')[0]
	};
	game_nes.prototype._cmd_cb = function(data, pure_tags, ext_tags) {
		switch(data.cmd) {
			case 'start':
				if(!this._started) {
					$('#board_size', this.element).val(data.size);
					$('#strict_mode', this.element).prop('checked', data.strict);
					this._host = false;
					this.start();
				}
				break;
			case 'reconnect':
				if(data.send_seq != this._recv_seq || data.recv_seq != this._send_seq)
					this.pipe.send('Error: Reconnect with invalid Sequence.', 'console_info');
				this._peer_lock();
				break;
			default:
				break;
		}
	};
	game_nes.prototype._send_cb = function(data, pure_tags, ext_tags) {
		var senddata = {
			"cmd": "none",
			"seq": ++this._send_seq,
			"data": data
		};
		if(pure_tags[0] == 'ppu_send') senddata.cmd = 'ppu';
		else if(pure_tags[0] == 'pad_send') senddata.cmd = 'pad';
		this.pipe.send(senddata, ['peersend_nes_game', 'peerid_all', 'peer_send']);
	};
	game_nes.prototype._recv_cb = function(data, pure_tags, ext_tags) {
		if(data.seq - this._recv_seq != 1) this.pipe.send('Error: Invalid Sequence.', 'console_info');
		this._recv_seq = data.seq;
		switch(data.cmd) {
			case 'ppu':
				this.pipe.send(data.data, 'ppu_recv');
				break;
			case 'pad':
				this.pipe.send(data.data, 'pad_recv');
				break;
			default:
				break;
		}
	};
	return game_nes;
})(comp_base);

