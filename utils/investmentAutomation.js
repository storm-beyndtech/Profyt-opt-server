import cron from "node-cron";
import { Transaction } from "../models/transaction.js";
import { User } from "../models/user.js";
import { isInvestmentDue } from "./dateUtils.js";
import { investmentCompleted } from "./mailer.js";

let isProcessing = false;

async function processCompletedInvestments() {
	if (isProcessing) {
		console.log("Investment completion already in progress, skipping...");
		return;
	}

	isProcessing = true;
	console.log("🔄 Starting automated investment completion check...");

	try {
		// Find all active investments
		const activeInvestments = await Transaction.find({
			type: "investment",
			status: "active",
			"planData.endDate": { $exists: true, $ne: null }
		});

		console.log(`📊 Found ${activeInvestments.length} active investments to check`);

		const currentDate = new Date();
		let completedCount = 0;

		for (const investment of activeInvestments) {
			try {
				const endDate = investment.planData.endDate;
				
				// Check if investment is due for completion
				if (isInvestmentDue(endDate, currentDate)) {
					console.log(`⏰ Completing investment ${investment._id} for user ${investment.user.email}`);

					// Find the user
					const user = await User.findById(investment.user.id);
					if (!user) {
						console.error(`❌ User not found for investment ${investment._id}`);
						continue;
					}

					// Update user balances
					user.deposit += Number(investment.amount); // Return principal
					user.interest += Number(investment.planData.interest); // Add interest to interest balance
					
					// Mark investment as completed
					investment.status = "completed";
					investment.planData.currentInterest = investment.planData.interest; // Set final interest

					// Save both user and transaction
					await Promise.all([
						user.save(),
						investment.save()
					]);

					// Send completion notification
					await investmentCompleted(
						user.email,
						user.fullName,
						investment.amount,
						investment.date,
						investment.planData.plan
					);

					completedCount++;
					console.log(`✅ Investment ${investment._id} completed successfully`);
				}
			} catch (error) {
				console.error(`❌ Error processing investment ${investment._id}:`, error.message);
			}
		}

		console.log(`🎉 Completed ${completedCount} investments out of ${activeInvestments.length} checked`);
	} catch (error) {
		console.error("❌ Error in investment automation:", error.message);
	} finally {
		isProcessing = false;
	}
}

// Run every 1 minute for testing, every 15 minutes for production
const startInvestmentAutomation = () => {
	console.log("🚀 Starting investment automation system...");
	
	// Schedule to run every 1 minute for testing (change to */15 for production)
	cron.schedule("*/1 * * * *", async () => {
		await processCompletedInvestments();
	}, {
		scheduled: true,
		timezone: "UTC"
	});

	// Run immediately on startup for any overdue investments
	setTimeout(async () => {
		console.log("🏁 Running initial investment completion check...");
		await processCompletedInvestments();
	}, 5000); // Wait 5 seconds after server start

	console.log("⏰ Investment automation scheduled: Every 1 minute (for testing)");
};

// Manual trigger function for testing/admin use
const manualInvestmentCheck = async () => {
	console.log("🔧 Manual investment completion check triggered");
	await processCompletedInvestments();
};

export { startInvestmentAutomation, manualInvestmentCheck };