import OBR from "@owlbear-rodeo/sdk";

OBR.onReady(async () => {
	const params = new URLSearchParams(window.location.search);
	const messageString = params.get("message");
	const titleString = params.get("title");
	const duration = parseInt(params.get("duration") || "5000");
	const messageElement = document.getElementById("message");
	const titleElement = document.getElementById("title");
	if (messageElement && messageString && titleElement && titleString) {
		messageElement.innerHTML = messageString;
		titleElement.textContent = titleString;
	}

	// Close on click
	document.body.addEventListener('click', () => {
		OBR.popover.close("quest.jelonek.owlbear.eem/notification");
	});

	// Auto close after 5 seconds
	setTimeout(() => {
		OBR.popover.close("quest.jelonek.owlbear.eem/notification");
	}, duration);
});
