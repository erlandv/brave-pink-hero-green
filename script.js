(() => {
	const HERO_GREEN = hexToRgb('#1b602f');
	const BRAVE_PINK = hexToRgb('#f784c5');
	const GREEN_LIN = rgbToLinear(HERO_GREEN);
	const PINK_LIN = rgbToLinear(BRAVE_PINK);

	const fileInput = document.getElementById('file-input');
	const dropzone = document.getElementById('dropzone');
	const downloadBtn = document.getElementById('download-btn');
	const tryAnotherBtn = document.getElementById('try-another-btn');
	const canvas = document.getElementById('canvas');
	const spinner = document.getElementById('spinner');
	const alertBox = document.getElementById('alert');
	const resultNote = document.getElementById('result-note');
	const placeholder = document.getElementById('placeholder');

	const ctx = canvas.getContext('2d', {
		willReadFrequently: true
	});

	let sourceBitmap = null;
	let sourceName = null;
	let sourceType = null;
	let resultBlob = null;

	function hexToRgb(hex) {
		const s = hex.replace('#', '').trim();
		const n = parseInt(s, 16);
		return {
			r: (n >> 16) & 255,
			g: (n >> 8) & 255,
			b: n & 255
		};
	}

	function srgbToLinearByte(c) {
		const v = c / 255;
		return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	}

	function linearToSrgbByte(x) {
		const v = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
		return Math.max(0, Math.min(255, Math.round(v * 255)));
	}

	function rgbToLinear({
		r,
		g,
		b
	}) {
		return {
			r: srgbToLinearByte(r),
			g: srgbToLinearByte(g),
			b: srgbToLinearByte(b)
		};
	}

	function lerp(a, b, t) {
		return a + (b - a) * t;
	}

	function showAlert(msg, isError = false) {
		alertBox.textContent = msg;
		alertBox.style.borderColor = isError ? '#ef4444' : '';
		alertBox.style.background = isError ? 'rgba(239,68,68,0.08)' : '';
		alertBox.classList.remove('hide');
	}

	function clearAlert() {
		alertBox.classList.add('hide');
	}

	function setBusy(b) {
		spinner.classList.toggle('hide', !b);
		downloadBtn.disabled = b || !resultBlob;
		tryAnotherBtn.disabled = b || !resultBlob;
	}

	function validImageType(t) {
		return t === 'image/png' || t === 'image/jpeg' || t === 'image/jpg';
	}

	function sanitizeFileName(base, ext) {
		const clean = (base || 'image').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
		return `${clean||'image'}-duotone.${ext}`;
	}

	function fileBase(name) {
		return (name || 'image').replace(/\.(png|jpg|jpeg)$/i, '');
	}

	function setCanvasSize(w, h) {
		canvas.width = w;
		canvas.height = h;
	}

	function resetToInitialState() {
		setCanvasSize(16, 9);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		downloadBtn.disabled = true;
		tryAnotherBtn.disabled = true;
		clearAlert();
		placeholder.classList.remove('hide');
		resultNote.textContent = 'No image yet. Drop a JPG/PNG above or click to browse.';
		sourceBitmap = null;
		sourceName = null;
		sourceType = null;
		resultBlob = null;
	}

	resetToInitialState();

	fileInput.addEventListener('change', async () => {
		if (!fileInput.files?.length) return;
		await handleFile(fileInput.files[0]);
		fileInput.value = '';
	});

	dropzone.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fileInput.click();
		}
	});

	['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
		e.preventDefault();
		e.stopPropagation();
		dropzone.classList.add('dragover');
	}));
	['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => {
		e.preventDefault();
		e.stopPropagation();
		if (ev === 'drop') {
			const dt = e.dataTransfer;
			if (dt?.files?.length) handleFile(dt.files[0]);
			else showAlert('No file detected. Try dropping a JPG or PNG.', true);
		}
		dropzone.classList.remove('dragover');
	}));

	async function handleFile(file) {
		clearAlert();
		resultBlob = null;
		downloadBtn.disabled = true;
		tryAnotherBtn.disabled = true;

		if (!validImageType(file.type)) {
			showAlert('Unsupported file type. Please use JPG/JPEG or PNG.', true);
			resultNote.textContent = 'Upload failed. Please try a different file.';
			return;
		}

		try {
			setBusy(true);
			resultNote.textContent = 'Processing image…';

			const bmp = await createImageBitmap(file);
			sourceBitmap = bmp;
			sourceName = file.name || 'image';
			sourceType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;

			setCanvasSize(bmp.width, bmp.height);

			await duotoneConvert();

			placeholder.classList.add('hide');
			resultNote.textContent = 'Ready. Download to save your duotone image.';
			downloadBtn.disabled = !resultBlob;
			tryAnotherBtn.disabled = !resultBlob;
		} catch (err) {
			console.error(err);
			showAlert('Failed to process the image. Try a different file.', true);
			resultNote.textContent = 'Conversion failed. Please try again.';
			downloadBtn.disabled = true;
			tryAnotherBtn.disabled = true;
		} finally {
			setBusy(false);
		}
	}

	async function duotoneConvert() {
		if (!sourceBitmap) throw new Error('No source');

		const w = canvas.width,
			h = canvas.height;

		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(sourceBitmap, 0, 0, w, h);

		const imgData = ctx.getImageData(0, 0, w, h);
		const d = imgData.data;

		for (let i = 0; i < d.length; i += 4) {
			const r = d[i],
				g = d[i + 1],
				b = d[i + 2];
			const rl = srgbToLinearByte(r),
				gl = srgbToLinearByte(g),
				bl = srgbToLinearByte(b);
			const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
			d[i] = linearToSrgbByte(lerp(GREEN_LIN.r, PINK_LIN.r, Y));
			d[i + 1] = linearToSrgbByte(lerp(GREEN_LIN.g, PINK_LIN.g, Y));
			d[i + 2] = linearToSrgbByte(lerp(GREEN_LIN.b, PINK_LIN.b, Y));
		}
		ctx.putImageData(imgData, 0, 0);

		const mime = (sourceType === 'image/png') ? 'image/png' : 'image/jpeg';
		resultBlob = await canvasToBlobSameType(canvas, mime);
		downloadBtn.disabled = !resultBlob;
		tryAnotherBtn.disabled = !resultBlob;
	}

	function canvasToBlobSameType(cv, mime) {
		if (mime === 'image/jpeg') {
			const tmp = document.createElement('canvas');
			tmp.width = cv.width;
			tmp.height = cv.height;
			const tctx = tmp.getContext('2d');
			tctx.fillStyle = '#ffffff';
			tctx.fillRect(0, 0, tmp.width, tmp.height);
			tctx.drawImage(cv, 0, 0);
			return new Promise(res => tmp.toBlob(b => res(b), 'image/jpeg', 0.92));
		}
		return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
	}

	downloadBtn.addEventListener('click', () => {
		if (!resultBlob) return;
		const ext = (sourceType === 'image/png') ? 'png' : 'jpg';
		const outName = sanitizeFileName(fileBase(sourceName), ext);
		const url = URL.createObjectURL(resultBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = outName;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	});

	tryAnotherBtn.addEventListener('click', () => {
		resetToInitialState();
	});

})();