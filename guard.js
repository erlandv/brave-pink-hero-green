window.addEventListener('load', () => {

	(() => {
		const deny = (kind, url = '') => {
			throw new Error(`[No-Upload Guard] Blocked ${kind}: ${url}`);
		};

		const _fetch = window.fetch;
		window.fetch = function(url, ...rest) {
			const u = new URL(url, location.href);
			if (u.origin !== location.origin) deny('fetch', u.href);
			return _fetch.apply(this, [url, ...rest]);
		};

		const XHR = window.XMLHttpRequest;
		window.XMLHttpRequest = function() {
			const xhr = new XHR();
			const _open = xhr.open;
			xhr.open = function(method, url, ...rest) {
				const u = new URL(url, location.href);
				if (u.origin !== location.origin) deny('xhr', u.href);
				return _open.call(xhr, method, url, ...rest);
			};
			return xhr;
		};

		if (navigator.sendBeacon) {
			const _beacon = navigator.sendBeacon.bind(navigator);
			navigator.sendBeacon = (url, data) => {
				const u = new URL(url, location.href);
				if (u.origin !== location.origin) deny('beacon', u.href);
				return _beacon(url, data);
			};
		}

		const WS = window.WebSocket;
		window.WebSocket = function(url) {
			const u = new URL(url, location.href);
			if (u.origin !== location.origin) deny('websocket', u.href);
			return new WS(url);
		};
		const ES = window.EventSource;
		if (ES) {
			window.EventSource = function(url) {
				const u = new URL(url, location.href);
				if (u.origin !== location.origin) deny('eventsource', u.href);
				return new ES(url);
			};
		}

		const imgSrc = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
		Object.defineProperty(Image.prototype, 'src', {
			set(v) {
				const u = new URL(v, location.href);
				const ok = (u.origin === location.origin) || u.protocol === 'blob:' || u.protocol === 'data:';
				if (!ok) deny('img', u.href);
				return imgSrc.set.call(this, v);
			}
		});
	})();

});