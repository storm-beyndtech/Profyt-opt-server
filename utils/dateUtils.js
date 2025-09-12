export function parseDurationToMilliseconds(durationString) {
	const duration = durationString.toLowerCase().trim();
	const regex = /^(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)$/;
	const match = duration.match(regex);
	
	if (!match) {
		throw new Error(`Invalid duration format: ${durationString}`);
	}
	
	const amount = parseInt(match[1]);
	const unit = match[2];
	
	// Convert to milliseconds
	switch (unit) {
		case 'minute':
		case 'minutes':
			return amount * 60 * 1000;
		case 'hour':
		case 'hours':
			return amount * 60 * 60 * 1000;
		case 'day':
		case 'days':
			return amount * 24 * 60 * 60 * 1000;
		case 'week':
		case 'weeks':
			return amount * 7 * 24 * 60 * 60 * 1000;
		case 'month':
		case 'months':
			// Approximate month as 30.44 days (365.25/12)
			return amount * 30.44 * 24 * 60 * 60 * 1000;
		case 'year':
		case 'years':
			// Account for leap years
			return amount * 365.25 * 24 * 60 * 60 * 1000;
		default:
			throw new Error(`Unsupported duration unit: ${unit}`);
	}
}

export function calculateEndDate(startDate, durationString) {
	const durationMs = parseDurationToMilliseconds(durationString);
	return new Date(startDate.getTime() + durationMs);
}

export function calculateProgressiveInterest(totalInterest, startDate, endDate, checkDate = new Date()) {
	const totalDuration = endDate.getTime() - startDate.getTime();
	const elapsedDuration = Math.min(checkDate.getTime() - startDate.getTime(), totalDuration);
	
	// Ensure we don't return negative values
	if (elapsedDuration <= 0) return 0;
	if (elapsedDuration >= totalDuration) return totalInterest;
	
	// Calculate proportional interest earned so far
	const progress = elapsedDuration / totalDuration;
	return Math.round((totalInterest * progress) * 100) / 100; // Round to 2 decimal places
}

export function isInvestmentDue(endDate, currentDate = new Date()) {
	return currentDate >= endDate;
}

export function formatTimeRemaining(endDate, currentDate = new Date()) {
	const timeRemaining = endDate.getTime() - currentDate.getTime();
	
	if (timeRemaining <= 0) {
		return "Investment completed";
	}
	
	const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000));
	const hours = Math.floor((timeRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
	const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
	
	if (days > 0) {
		return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`;
	} else if (hours > 0) {
		return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
	} else {
		return `${minutes} minute${minutes > 1 ? 's' : ''}`;
	}
}