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
 *  Image resizing and uploading currently works in Fx 3 and up only.
 *  An extra settings will allow Webkit users to upload the original image.
 *
 *  Usage:
 *   $.fileUploadSupported // a boolean value indicates if the browser is supported.
 *   $.imageUploadSupported // a boolean value indicates if the browser could handle uploading resized images.
 *   $('input[type=file]').fileUpload(ajaxSettings); //Make a input[type=file] select-and-send file upload widget
 *   $('#any-element').fileUpload(ajaxSettings); //Make a element receive dropped file
 *   //TBD $('form#fileupload').fileUpload(ajaxSettings); //Send a ajax form with file
 *   //TBD $('canvas').fileUpload(ajaxSettings); //Upload given canvas as if it's an png image.
 *
 *   ajaxSettings is the object contains $.ajax settings that will be passed to.
 *   Available extended settings are:
 *      fileType:
 *           regexp check against filename extension; You should always checked it again on server-side.
 *           e.g. /^(gif|jpe?g|png|tiff?)$/i for images
 *      fileMaxSize:
 *           Maxium file size allowed in bytes. Use scientific notation for converience.
 *           e.g. 1E4 for 1KB, 1E8 for 1MB, 1E9 for 10MB.
 *			 If you really care the difference between 1024 and 1000, use Math.pow(2, 10)
 *      fileError(info, textStatus, textDescription):
 *           callback function when there is any error preventing file upload to start,
 *           $.ajax and ajax events won't be called when error.
 *           Use $.noop to overwrite default alert function.
 *      imageMaxWidth, imageMaxHeight:
 *           Use any of the two settings to enable client-size image resizing.
 *           Image will be resized to fit into given rectangle.
 *           File size and type limit checking will be ignored.
 *      allowUploadOriginalImage:
 *           Set to true if you accept original image to be uploaded as a fallback
 *           when image resizing functionality is not availible.
 *           File size and type limit will be enforced.
 *      forceResize:
 *           Set to true will cause the image being re-sampled even if the resized image 
 *           has the same demension as the original one.
 *      imageType:
 *           Acceptable values are: 'jpeg', 'png', or 'auto'.
 *
 *  TBD: 
 *   ability to change settings after binding (you can unbind and bind again as a workaround)
 *   multipole file handling
 *   form intergation
 *
 */

(function($) {
	// Don't do logging if window.log function does not exist.
	var log = window.log || $.noop;

	// jQuery.ajax config
	var config = {
		fileError: function (info, textStatus, textDescription) {
			window.alert(textDescription);
		}
	};
	
	// Feature detection
	
	var canSendBinaryString = (XMLHttpRequest && XMLHttpRequest.prototype.sendAsBinary);
	
	var isSupported = (function () {
		if (
			!canSendBinaryString // Gecko specific binary xhr since Fx3.0
			&&
			!window.FormData // HTML5 browsers that supports FormData interface (which append files)
		) {
			log('INFO: This is not a supported browser');
			return false;
		}
		log('INFO: This is a ajaxupload-enabled browser.');
		return true;
	})();

	var isImageSupported = (function () {
		var canvas = document.createElement('canvas');
		if (canvas.mozGetAsFile) {
			// Fx4 (> beta 7; 20100917) non-standard in-memory file
			log('INFO: This browser supports image resizing and uploading through canvas.mozGetAsFile.');
			return true;
		}
		if (
			(window.FileReader || window.File.prototype.getAsDataURL)
			&& window.atob && canvas.toDataURL && canSendBinaryString
		) {
			// Use above functions to extract and send binary string
			log('INFO: This browser supports image resizing and uploading through binary string uploading.');
			return true;
		}
		log('INFO: This browser does not support uploading resized images.');
		return false;
	})();
	
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
			type: file.type || '', // MIME type
			size: file.size || file.fileSize,
			name: file.name || file.fileName
		};

		settings.resizeImage = !!(settings.imageMaxWidth || settings.imageMaxHeight);

		if (settings.resizeImage && !isImageSupported && settings.allowUploadOriginalImage) {
			log('WARN: Fall back to upload original un-resized image.');
			settings.resizeImage = false;
		}
		
		if (settings.resizeImage) {
			settings.imageMaxWidth = settings.imageMaxWidth || Infinity;
			settings.imageMaxHeight = settings.imageMaxHeight || Infinity;
		}

		if (!settings.resizeImage) {
			if (settings.fileType && settings.fileType.test) {
				// Not using MIME types
				if (!settings.fileType.test(info.name.substr(info.name.lastIndexOf('.')+1))) {
					log('ERROR: Invalid Filetype.');
					settings.fileError.call(this, info, 'INVALID_FILETYPE', 'Invalid filetype.');
					return;
				}
			}
			
			if (settings.fileMaxSize && file.size > settings.fileMaxSize) {
				log('ERROR: File exceeds size limit.');
				settings.fileError.call(this, info, 'FILE_EXCEEDS_SIZE_LIMIT', 'File exceeds size limit.');
				return;
			}
		}

		if (!settings.resizeImage && window.FormData) {
			log('INFO: Bypass file reading, insert file object into FormData object directly.');
			handleForm(settings, file, null, info);
		} else if (window.FileReader) {
			log('INFO: Using FileReader to do asynchronously file reading.');
			var reader = new FileReader();
			reader.onerror = function (ev) {
				if (ev.target.error) {
					switch (ev.target.error) {
						case 8:
						log('ERROR: File not found.');
						settings.fileError.call(this, info, 'FILE_NOT_FOUND', 'File not found.');
						break;
						case 24:
						log('ERROR: File not readable.');
						settings.fileError.call(this, info, 'IO_ERROR', 'File not readable.');
						break;
						case 18:
						log('ERROR: File cannot be access due to security constrant.');
						settings.fileError.call(this, info, 'SECURITY_ERROR', 'File cannot be access due to security constrant.');
						break;
						case 20: //User Abort
						break;
					}
				}
			}
			if (!settings.resizeImage) {
				reader.onloadend = function (ev) {
					var bin = ev.target.result;
					handleForm(settings, file, bin, info);
				};
				reader.readAsBinaryString(file);
			} else {
				reader.onloadend = function (ev) {
					var dataurl = ev.target.result;
					handleImage(settings, file, dataurl, info);
				};
				reader.readAsDataURL(file);
			}
		} else {
			log('WARN: FileReader does not exist, UI will be blocked when reading big file.');
			if (!settings.resizeImage) {
				try {
					var bin = file.getAsBinary();
				} catch (e) {
					log('ERROR: File not readable.');
					settings.fileError.call(this, info, 'IO_ERROR', 'File not readable.');
					return;
				}
			} else {
				try {
					var bin = file.getAsDataURL();
				} catch (e) {
					log('ERROR: File not readable.');
					settings.fileError.call(this, info, 'IO_ERROR', 'File not readable.');
					return;
				}
			}
			handleImage(settings, file, dataurl, info);
		}
	};

	// step 1.5: inject file into <img>, paste the pixels into <canvas>,
	// read the final image
	var handleImage = function (settings, file, dataurl, info) {
		var timer = setTimeout(
			function () {
				log('ERROR: <img> failed to load, file is not a supported image format.');
				settings.fileError.call(this, info, 'FILE_NOT_IMAGE', 'File is not a supported image format.');
			},
			200 //FIXME: what if a local file did take longer than this time to load.
		);
		var img = new Image();
		img.onload = function () {
			clearTimeout(timer);
			var ratio = Math.max(
				img.width/settings.imageMaxWidth,
				img.height/settings.imageMaxHeight,
				1
			);
			var d = {
				w: Math.floor(Math.max(img.width/ratio, 1)),
				h: Math.floor(Math.max(img.height/ratio, 1))
			}
			log(
				'INFO: Original image size: ' + img.width.toString(10) + 'x' + img.height.toString(10)
				+ ', resized image size: ' + d.w + 'x' + d.h + '.'
			);
			if (!settings.forceResize && img.width === d.w && img.height === d.h) {
				log('INFO: Image demension is the same, send the original file.');
				handleForm(
					settings,
					file,
					window.atob(dataurl.substr(dataurl.indexOf('e64,')+4)),
					info
				);
				return;
			}
			var canvas = document.createElement('canvas');
			canvas.setAttribute('width', d.w);
			canvas.setAttribute('height', d.h);
			canvas.getContext('2d').drawImage(
				img,
				0,
				0,
				img.width,
				img.height,
				0,
				0, 
				d.w,
				d.h
			);
			if (!settings.imageType || settings.imageType === 'auto') {
				if (info.type === 'image/jpeg') settings.imageType = 'jpeg';
				else settings.imageType = 'png';
			}
			
			var ninfo = {
				type: 'image/' + settings.imageType,
				name: info.name.substr(0, info.name.indexOf('.')) + '.resized.' + settings.imageType
			};
			
			if (canvas.mozGetAsFile && window.FormData) {
				// Gecko 2 (Fx4) non-standard function
				var nfile = canvas.mozGetAsFile(
					ninfo.name,
					'image/' + settings.imageType
				);
				ninfo.size = file.size || file.fileSize;
				handleForm(
					settings,
					nfile,
					null,
					ninfo
				);
			} else {
				// Read the image as DataURL, convert it back to binary string.
				var bin = window.atob(
					canvas
					.toDataURL('image/' + settings.imageType)
					.substr(19 + settings.imageType.length) // ('data:image/' + ';base64,').length === 19
				);
				ninfo.size = bin.length;
				handleForm(
					settings,
					null,
					bin,
					ninfo
				);
			}
		}
		img.src = dataurl;
	}
	// Step 2: construct form data and send the file
	// paramaters: Ajax settings, File object, binary string of file || null, file info assoc array
	var handleForm = function (settings, file, bin, info) {
		if (window.FormData && file) {
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
		} else if (canSendBinaryString) {
			log('INFO: Concat our own multipart/form-data data string.');
			
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
			settings.contentType = 'multipart/form-data; boundary=' + bd;
			settings.data = '--' + bd + '\n' // RFC 1867 Format, simulate form file upload
			+ 'content-disposition: form-data; name="Filedata";'
			+ ' filename="' + (info.name_bin || info.name) + '"\n'
			+ 'Content-Type: ' + info.type + '\n\n'
			+ bin + '\n\n'
			+ '--' + bd + '--';
		} else {
			log('ERROR: Image data is represent as a string but binary xhr function not available. You may set allowUploadOriginalImage to allow the original file being sent.');
			return;
		}
		xhrupload(settings);
	};

	// Step 3: start sending out file
	var xhrupload = function (settings) {
		log('INFO: Sending file.');
		if (typeof settings.data === 'string' && canSendBinaryString) {
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

		if (!isSupported) {
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
	$.imageUploadSupported = isImageSupported;
	
})(jQuery);
