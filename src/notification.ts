import OBR from "@owlbear-rodeo/sdk";

const NOTIFICATION_ID = "quest.jelonek.owlbear.eem/notification";

export async function showCustomNotification(title: string, message: string) {
	// Close existing if any
	await OBR.popover.close(NOTIFICATION_ID);

	const width = 400;

	// Estimate height
	// Base height for title and padding ~ 60px
	// Approx 50 chars per line at 400px width
	// 20px per line
	const lines = message.split('<br>');
	let lineCount = 0;
	lines.forEach(line => {
		// Strip HTML tags for length calculation
		const text = line.replace(/<[^>]*>/g, '');
		lineCount += Math.max(1, Math.ceil(text.length / 50));
	});

	const height = 60 + (lineCount * 20);

	const encodedMessage = encodeURIComponent(message);
	const url = `/notification.html?message=${encodedMessage}&title=${encodeURIComponent(title)}`;

	const viewportWidth = await OBR.viewport.getWidth();

	await OBR.popover.open({
		id: NOTIFICATION_ID,
		url: url,
		height: height,
		width: width,
		anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
		transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
		anchorPosition: { left: viewportWidth / 2, top: 60 },
		anchorReference: "POSITION",
		disableClickAway: true // We handle click to close inside
	});
}