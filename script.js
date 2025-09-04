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
   const canvasWrap = document.getElementById('canvas-wrap');
   const ctx = canvas.getContext('2d', {
      willReadFrequently: true
   });

   const toneControls = document.getElementById('tone-controls');
   const intensityRange = document.getElementById('intensity');
   const intensityValueEl = document.getElementById('intensity-value');

   let sourceBitmap = null;
   let sourceName = null;
   let sourceType = null;
   let resultBlob = null;
   let baElem = null;

   let isDirty = false;
   let rafToken = 0;
   let encoding = false;

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
      downloadBtn.disabled = b || (!resultBlob && !sourceBitmap);
      tryAnotherBtn.disabled = b || !sourceBitmap;
   }

   function validImageType(t) {
      return t === 'image/png' || t === 'image/jpeg' || t === 'image/jpg';
   }

   function sanitizeFileName(base, ext) {
      const clean = (base || 'image').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
      return `${clean || 'image'}-duotone.${ext}`;
   }

   function fileBase(name) {
      return (name || 'image').replace(/\.(png|jpg|jpeg)$/i, '');
   }

   function setCanvasSize(w, h) {
      canvas.width = w;
      canvas.height = h;
   }

   function destroyBeforeAfter() {
      if (baElem) {
         baElem.remove();
         baElem = null;
      }
      canvas.classList.remove('hide');
   }

   function mountBeforeAfter() {
      if (!sourceBitmap || !canvas.width || !canvas.height) return;
      destroyBeforeAfter();

      const w = canvas.width,
         h = canvas.height;

      const ba = document.createElement('div');
      ba.className = 'ba';
      ba.style.setProperty('--ar', `${w} / ${h}`);

      const afterC = document.createElement('canvas');
      afterC.width = w;
      afterC.height = h;
      afterC.getContext('2d').drawImage(canvas, 0, 0);
      ba.appendChild(afterC);

      const beforeC = document.createElement('canvas');
      beforeC.width = w;
      beforeC.height = h;
      beforeC.className = 'ba-before';
      beforeC.getContext('2d').drawImage(sourceBitmap, 0, 0, w, h);
      ba.appendChild(beforeC);

      const divider = document.createElement('div');
      divider.className = 'ba-divider';
      const knob = document.createElement('div');
      knob.className = 'ba-knob';
      knob.innerHTML = `
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M9 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2"/>
				<path d="M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/>
			</svg>`;
      divider.appendChild(knob);
      ba.appendChild(divider);

      const labL = document.createElement('div');
      labL.className = 'ba-label before';
      labL.textContent = 'Before';
      const labR = document.createElement('div');
      labR.className = 'ba-label after';
      labR.textContent = 'After';
      ba.append(labL, labR);

      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'ba-range';
      range.min = 0;
      range.max = 100;
      range.value = 50;
      range.setAttribute('aria-label', 'Before–After slider');
      ba.appendChild(range);

      setPos(50);
      range.addEventListener('input', () => setPos(range.value));

      ba.addEventListener('pointerdown', (e) => {
         const rect = ba.getBoundingClientRect();
         moveFrom(e.clientX, rect);
         ba.setPointerCapture?.(e.pointerId);
      });
      ba.addEventListener('pointermove', (e) => {
         if (e.pressure === 0 && e.buttons === 0) return;
         const rect = ba.getBoundingClientRect();
         moveFrom(e.clientX, rect);
      });

      function moveFrom(clientX, rect) {
         let x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
         const pct = (x / rect.width) * 100;
         range.value = String(Math.round(pct));
         setPos(pct);
      }

      function setPos(pct) {
         ba.style.setProperty('--pos', `${pct}%`);
      }

      canvas.classList.add('hide');
      canvasWrap.appendChild(ba);
      baElem = ba;
   }

   function syncBeforeAfterAfterCanvas() {
      if (!baElem) return;
      const afterC = baElem.querySelector('canvas:not(.ba-before)');
      if (!afterC) return;
      const actx = afterC.getContext('2d');
      actx.clearRect(0, 0, afterC.width, afterC.height);
      actx.drawImage(canvas, 0, 0);
   }

   function resetToInitialState() {
      destroyBeforeAfter();
      setCanvasSize(16, 9);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      downloadBtn.disabled = true;
      tryAnotherBtn.disabled = true;
      clearAlert();
      placeholder.classList.remove('hide');
      resultNote.textContent = 'Drop your photo to get started.';
      sourceBitmap = null;
      sourceName = null;
      sourceType = null;
      resultBlob = null;
      isDirty = false;

      if (intensityRange) intensityRange.value = '100';
      if (intensityValueEl) intensityValueEl.textContent = '100%';
      if (toneControls) {
         toneControls.classList.add('hide');
         toneControls.setAttribute('aria-hidden', 'true');
      }
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
      isDirty = false;
      downloadBtn.disabled = true;
      tryAnotherBtn.disabled = true;
      destroyBeforeAfter();

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

         renderDuotoneToCanvas(getIntensity());
         await encodeCanvasToBlob();

         placeholder.classList.add('hide');
         resultNote.textContent = 'Drag the slider to compare. Fine-tune with Duotone Intensity, then Download.';
         downloadBtn.disabled = !resultBlob;
         tryAnotherBtn.disabled = false;

         mountBeforeAfter();

         if (toneControls) {
            toneControls.classList.remove('hide');
            toneControls.setAttribute('aria-hidden', 'false');
         }
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

   function getIntensity() {
      const v = Number(intensityRange?.value ?? 100);
      return Math.max(0, Math.min(1, v / 100));
   }

   function renderDuotoneToCanvas(inten) {
      if (!sourceBitmap) return;

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
         const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl; // 0..1

         const duoR = lerp(GREEN_LIN.r, PINK_LIN.r, Y);
         const duoG = lerp(GREEN_LIN.g, PINK_LIN.g, Y);
         const duoB = lerp(GREEN_LIN.b, PINK_LIN.b, Y);

         const mixR = lerp(Y, duoR, inten);
         const mixG = lerp(Y, duoG, inten);
         const mixB = lerp(Y, duoB, inten);

         d[i] = linearToSrgbByte(mixR);
         d[i + 1] = linearToSrgbByte(mixG);
         d[i + 2] = linearToSrgbByte(mixB);
      }
      ctx.putImageData(imgData, 0, 0);

      isDirty = true;
      syncBeforeAfterAfterCanvas();
   }

   async function encodeCanvasToBlob() {
      if (!sourceBitmap) return;
      if (encoding) return;
      encoding = true;
      try {
         const mime = (sourceType === 'image/png') ? 'image/png' : 'image/jpeg';
         resultBlob = await canvasToBlobSameType(canvas, mime);
         isDirty = false;
         downloadBtn.disabled = !resultBlob;
      } finally {
         encoding = false;
      }
   }

   if (intensityRange) {
      intensityValueEl.textContent = `${Math.round(getIntensity() * 100)}%`;

      intensityRange.addEventListener('input', () => {
         intensityValueEl.textContent = `${intensityRange.value}%`;
         if (rafToken) cancelAnimationFrame(rafToken);
         rafToken = requestAnimationFrame(() => {
            renderDuotoneToCanvas(getIntensity());
            rafToken = 0;
         });
      });

      intensityRange.addEventListener('change', async () => {
         await encodeCanvasToBlob();
      });
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

   downloadBtn.addEventListener('click', async () => {
      if (!sourceBitmap) return;
      if (isDirty || !resultBlob) {
         await encodeCanvasToBlob();
      }
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