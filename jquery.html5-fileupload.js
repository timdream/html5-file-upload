/*
 *  jQuery HTML5 File Upload
 *  
 *  Author: timdream at gmail.com
 *  Web: http://timc.idv.tw/html5-file-upload/
 *  
 *  Ajax File Upload that use real xhr,
 *  built with getAsBinary, sendAsBinary, FormData, FileReader and etc.
 *  works in Firefox 3, Chrome 5, Safari 5 and higher
 *
 *  Usage:
 *   $.fileUploadSupported() //return a boolean value indicates if the browser is supported.
 *   $('input[type=file]').fileUpload(ajaxSettings); //Make a input[type=file] select-and-send file upload widget
 *   $('#any-element').fileUpload(ajaxSettings); //Make a element receive dropped file
 *   //TBD $('form#fileupload').fileUpload(ajaxSettings); //Send a ajax form with file
 *
 *   ajaxSettings is the object contains $.ajax settings that will be passed to.
 *
 *  TBD: 
 *   Better file reading error handling
 *   multipole file handling
 *   form intergation
 *
 */

(function($) {
	// Don't do logging if window.log function does not exist.
	var log = window.log || $.noop;

	// jQuery.ajax config
	var config = {};
	
	// Feature detection
	var isSupported = function () {
		if (
			!(XMLHttpRequest && XMLHttpRequest.prototype.sendAsBinary) // Gecko specific binary xhr since Fx3.0
			&&
			!window.FormData // HTML5 browsers that supports FormData interface (which append files)
		) {
			log('INFO: This is not a supported browser');
			return false;
		}
		log('INFO: This is a ajaxupload-enabled browser.');
		return true;
	}

	// Overwrite xhr.send() in Gecko > 1.9.0 (Fx30)
	/* if (XMLHttpRequest && XMLHttpRequest.prototype.sendAsBinary) {
		log('INFO: xhr.send is overwritten.');
		XMLHttpRequest.prototype._send = XMLHttpRequest.prototype.send;
		XMLHttpRequest.prototype.send = function (data) {
			if (typeof data === 'string') {
				log('INFO: Using xhr.sendAsBinary.');
				return this.sendAsBinary(data);
			} else {
				return this._send(data);
			}
		}
	} */

	// Step 1: check file info and attempt to read the file
	// paramaters: Ajax settings, File object
	var handleFile = function (settings, file) {
		var info = {
			// properties of standard File object || Gecko 1.9 properties
			type: file.type || '',
			size: file.size || file.fileSize,
			name: file.name || file.fileName
		};
		
		// File size|type|name checking goes here

		if (window.FormData) {
			log('INFO: Bypass file reading, insert file object into FormData object directly.');
			handleForm(settings, file, null, info);
		} else if (window.FileReader) {
			log('INFO: Using FileReader to do asynchronously file reading.');
			var reader = new FileReader();
			reader.onloadend = function (ev) {
				var bin = ev.target.result;
				handleForm(settings, file, bin, info);
			};
			reader.onerror = function (ev) {
				if (ev.target.error) {
					switch (ev.target.error) {
						case 8:
						window.alert('File not found.');
						break;
						case 24:
						window.alert('File not readable.');
						break;
						case 18:
						window.alert('File cannot be access due to security constrant.');
						break;
						case 20: //User Abort
						break;
					}
				}
			}
			reader.readAsBinaryString(file);
		} else {
			log('WARN: FileReader does not exist, UI will be blocked when reading big file.');
			try {
				var bin = file.getAsBinary();
			} catch (e) {
				window.alert('File cannot be accessed.');
				return;
			}
			handleForm(settings, file, bin, info);
		}
	};

	// Step 2: construct form data and send the file
	// paramaters: Ajax settings, File object, binary string of file || null, file info assoc array
	var handleForm = function (settings, file, bin, info) {
		if (window.FormData) {
			// FormData API saves the day
			log('INFO: Using FormData to construct form.');
			var formdata = new FormData();
			formdata.append('Filedata', file);
			// Prevent jQuery form convert FormData object into string.
			settings.processData = false;
			// Prevent jQuery from overwrite automatically generated xhr content-Type header
			// by unsetting the default contentType and inject data only right before xhr.send()
			settings.contentType = null;
			settings.__beforeSend = settings.beforeSend;
			settings.beforeSend = function (xhr, s) {
				s.data = formdata;
				if (s.__beforeSend) return s.__beforeSend.call(this, xhr, s);
			}
			//settings.data = formdata;
		} else {
			log('INFO: FormData does not exist, concat our own multipart/form-data data string.');
			
			// A placeholder MIME type
			if (!info.type) info.type = 'application/octet-stream';

			if (/[^\x20-\x7E]/.test(info.name)) {
				log('INFO: Filename contains non-ASCII code, do UTF8-binary string conversion.');
				info.name_bin = unescape(encodeURIComponent(info.name));
			}
			
			//filtered out non-ASCII chars in filenames
			// info.name = info.name.replace(/[^\x20-\x7E]/g, '_');
			
			// multipart/form-data boundary
			var bd = 'xhrupload-' + parseInt(Math.random()*(2 << 16));
			settings.contentType = 'multipart/form-data, boundary=' + bd;
			settings.data = '--' + bd + '\n' // RFC 1867 Format, simulate form file upload
			+ 'content-disposition: form-data; name="Filedata";'
			+ ' filename="' + (info.name_bin || info.name) + '"\n'
			+ 'Content-Type: ' + info.type + '\n\n'
			+ bin + '\n\n'
			+ '--' + bd + '--';
		}
		xhrupload(settings);
	};

	// Step 3: start sending out file
	var xhrupload = function (settings) {
		log('INFO: Sending file.');
		if (!window.FormData && XMLHttpRequest && XMLHttpRequest.prototype.sendAsBinary) {
			log('INFO: Using xhr.sendAsBinary.');
			settings.___beforeSend = settings.beforeSend;
			settings.beforeSend = function (xhr, s) {
				xhr.send = xhr.sendAsBinary;
				if (s.___beforeSend) return s.___beforeSend.call(this, xhr, s);
			}
		}
		$.ajax(settings);
	};
	
	$.fn.fileUpload = function(settings) {

		if (!isSupported()) {
			log('ERROR: skip not-supported browser.');
			return;
		}

		this.each(function(i, el) {
			if ($(el).is('input[type=file]')) {
				log('INFO: binding onchange event to a input[type=file].');
				$(el).bind(
					'change',
					function () {
						if (!this.files.length) {
							log('ERROR: no file selected.');
							return;
						} else if (this.files.length > 1) {
							log('WARN: Multiple file upload not implemented yet, only first file will be uploaded.');
						}
						handleFile($.extend({}, config, settings), this.files[0]);
						
						if (this.form.length === 1) {
							this.form.reset();
						} else {
							log('WARN: Unable to reset file selection, upload won\'t be triggered again if user selects the same file.');
						}
						return;
					}
				);
			}
			
			if ($(el).is('form')) {
				log('ERROR: <form> not implemented yet.');
			} else {
				log('INFO: binding ondrop event.');
				$(el).bind(
					'dragover', // dragover behavior should be blocked for drop to invoke.
					function(ev) {
						return false;
					}
				).bind(
					'drop',
					function (ev) {
						if (!ev.originalEvent.dataTransfer.files) {
							log('ERROR: No FileList object present; user might had dropped text.');
							return false;
						}
						if (!ev.originalEvent.dataTransfer.files.length) {
							log('ERROR: User had dropped a virual file (e.g. "My Computer")');
							return false;
						}
						if (!ev.originalEvent.dataTransfer.files.length > 1) {
							log('WARN: Multiple file upload not implemented yet, only first file will be uploaded.');
						}
						handleFile($.extend({}, config, settings), ev.originalEvent.dataTransfer.files[0]);
						return false;
					}
				);
			}
		});

		return this;
	};
	
	$.fileUploadSupported = isSupported;
	
})(jQuery);
