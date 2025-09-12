import express from "express";
import { Plan } from "../models/plan.js";
import { Transaction } from "../models/transaction.js";
import { User } from "../models/user.js";
import {
	alertAdmin,
	investmentApproved,
	investmentCompleted,
	investmentRejected,
	investmentRequested,
} from "../utils/mailer.js";
import { calculateEndDate, calculateProgressiveInterest, isInvestmentDue, formatTimeRemaining } from "../utils/dateUtils.js";
import { manualInvestmentCheck } from "../utils/investmentAutomation.js";

const router = express.Router();

// GET /api/plans - Get all active plans
router.get("/", async (req, res) => {
	try {
		const plans = await Plan.find({ isActive: true }).sort({ minAmount: 1 });
		res.json(plans);
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// GET /api/plans/:id - Get single plan
router.get("/:id", async (req, res) => {
	try {
		const plan = await Plan.findById(req.params.id);
		if (!plan) {
			return res.status(404).json({ message: "Plan not found" });
		}
		res.json(plan);
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// POST /api/plans - Create new plan
router.post("/", async (req, res) => {
	try {
		const { name, description, roi, minAmount, duration, features } = req.body;

		// Validation
		if (!name || !description || !roi || !minAmount || !duration || !features) {
			return res.status(400).json({ message: "All fields are required" });
		}

		if (roi < 0 || roi > 1000) {
			return res.status(400).json({ message: "ROI must be between 0 and 1000" });
		}

		if (minAmount < 0) {
			return res.status(400).json({ message: "Minimum amount must be positive" });
		}

		if (!Array.isArray(features) || features.length === 0) {
			return res.status(400).json({ message: "At least one feature is required" });
		}

		// Check for duplicate plan names
		const existingPlan = await Plan.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } });
		if (existingPlan) {
			return res.status(400).json({ message: "Plan name already exists" });
		}

		const plan = new Plan({
			name,
			description,
			roi,
			minAmount,
			duration,
			features: features.filter((f) => f.trim() !== ""),
		});

		const savedPlan = await plan.save();
		res.status(201).json(savedPlan);
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// PUT /api/plans/:id - Update plan
router.put("/:id", async (req, res) => {
	try {
		const { name, description, roi, minAmount, duration, features } = req.body;

		// Validation
		if (!name || !description || !roi || !minAmount || !duration || !features) {
			return res.status(400).json({ message: "All fields are required" });
		}

		if (roi < 0 || roi > 1000) {
			return res.status(400).json({ message: "ROI must be between 0 and 1000" });
		}

		if (minAmount < 0) {
			return res.status(400).json({ message: "Minimum amount must be positive" });
		}

		if (!Array.isArray(features) || features.length === 0) {
			return res.status(400).json({ message: "At least one feature is required" });
		}

		// Check for duplicate plan names (excluding current plan)
		const existingPlan = await Plan.findOne({
			name: { $regex: new RegExp(`^${name}$`, "i") },
			_id: { $ne: req.params.id },
		});
		if (existingPlan) {
			return res.status(400).json({ message: "Plan name already exists" });
		}

		const plan = await Plan.findByIdAndUpdate(
			req.params.id,
			{
				name,
				description,
				roi,
				minAmount,
				duration,
				features: features.filter((f) => f.trim() !== ""),
			},
			{ new: true, runValidators: true },
		);

		if (!plan) {
			return res.status(404).json({ message: "Plan not found" });
		}

		res.json(plan);
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// DELETE /api/plans/:id - Soft delete plan
router.delete("/:id", async (req, res) => {
	try {
		const plan = await Plan.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });

		if (!plan) {
			return res.status(404).json({ message: "Plan not found" });
		}

		res.json({ message: "Plan deleted successfully" });
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// POST /api/plans/invest - Create investment (User) - Now with automatic approval
router.post("/invest", async (req, res) => {
	try {
		const { planId, amount, userId, interest } = req.body;

		// Get plan
		const plan = await Plan.findById(planId);
		if (!plan || !plan.isActive) {
			return res.status(404).json({ message: "Plan not found" });
		}

		// Check minimum amount
		if (amount < plan.minAmount) {
			return res.status(400).json({ message: `Minimum amount is $${plan.minAmount}` });
		}

		// Get user and check balance
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check if user has sufficient balance
		if (user.deposit < amount) {
			return res.status(400).json({
				message: `Insufficient balance. Available: $${user.deposit}`,
			});
		}

		// Deduct amount from user balance
		user.deposit -= amount;
		await user.save();

		// Calculate investment dates
		const startDate = new Date();
		const endDate = calculateEndDate(startDate, plan.duration);
		const totalInterest = interest || (amount * plan.roi) / 100;

		// Create investment transaction with automatic approval
		const transaction = new Transaction({
			type: "investment",
			user: {
				id: userId,
				email: user.email,
				name: user.username,
			},
			status: "active", // Automatically set to active instead of pending
			amount: amount,
			planData: {
				plan: plan.name,
				duration: plan.duration,
				interest: totalInterest,
				startDate: startDate,
				endDate: endDate,
				currentInterest: 0, // Progressive interest starts at 0
			},
		});

		await transaction.save();
		
		// Send approval notification instead of request
		await investmentApproved(user.email, user.fullName, amount, transaction.date, plan.name);
		await alertAdmin(user.email, amount, transaction.date, "investment");
		
		res.status(201).json({
			message: "Investment activated successfully",
			remainingBalance: user.deposit,
			investment: {
				id: transaction._id,
				status: "active",
				startDate: startDate,
				endDate: endDate,
				timeRemaining: endDate.getTime() - startDate.getTime(),
			},
		});
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// PUT /api/plans/investment/:id - Update investment status (Admin)
router.put("/investment/:id", async (req, res) => {
	try {
		const { id } = req.params;
		const { status } = req.body; // 'approved', 'rejected', 'completed'

		const transaction = await Transaction.findById(id);
		if (!transaction || transaction.type !== "investment") {
			return res.status(404).json({ message: "Investment not found" });
		}

		// Find user and update their balance
		const user = await User.findById(transaction.user.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Update status
		transaction.status = status;

		if (status === "rejected") {
			// If rejected, refund amount to user balance
			user.deposit += Number(transaction.amount);
			transaction.amount = 0;
			await user.save();
			await investmentRejected(
				user.email,
				user.fullName,
				transaction.amount,
				transaction.date,
				transaction.planData.plan,
			);
		}
		if (status === "approved") {
			await investmentApproved(
				user.email,
				user.fullName,
				transaction.amount,
				transaction.date,
				transaction.planData.plan,
			);
		}

		// If completed, add interest to amount and fund user balance
		if (status === "completed") {
			if (user) {
				user.deposit += Number(transaction.amount);
				user.interest += Number(transaction.planData.interest);
				await user.save();
			}

			await investmentCompleted(
				user.email,
				user.fullName,
				transaction.amount,
				transaction.date,
				transaction.planData.plan,
			);
		}

		await transaction.save();

		res.json({
			message: `Investment ${status} successfully`,
			transaction: transaction,
		});
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// GET /api/plans/investment/:id/progress - Get current investment progress
router.get("/investment/:id/progress", async (req, res) => {
	try {
		const { id } = req.params;
		
		const transaction = await Transaction.findById(id);
		if (!transaction || transaction.type !== "investment") {
			return res.status(404).json({ message: "Investment not found" });
		}

		const currentDate = new Date();
		const startDate = transaction.planData.startDate;
		const endDate = transaction.planData.endDate;
		const totalInterest = transaction.planData.interest;

		// Calculate current progressive interest
		const currentInterest = calculateProgressiveInterest(totalInterest, startDate, endDate, currentDate);
		const timeRemaining = formatTimeRemaining(endDate, currentDate);
		const isCompleted = isInvestmentDue(endDate, currentDate);

		res.json({
			investmentId: id,
			status: isCompleted ? "ready_to_complete" : transaction.status,
			totalAmount: transaction.amount,
			totalInterest: totalInterest,
			currentInterest: currentInterest,
			progress: Math.min((currentInterest / totalInterest) * 100, 100),
			timeRemaining: timeRemaining,
			startDate: startDate,
			endDate: endDate,
			isCompleted: isCompleted,
		});
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// GET /api/plans/investments/active - Get all active investments for automation
router.get("/investments/active", async (req, res) => {
	try {
		const activeInvestments = await Transaction.find({
			type: "investment",
			status: "active"
		});

		const currentDate = new Date();
		const investmentsWithProgress = activeInvestments.map(investment => {
			const startDate = investment.planData.startDate;
			const endDate = investment.planData.endDate;
			const totalInterest = investment.planData.interest;
			const currentInterest = calculateProgressiveInterest(totalInterest, startDate, endDate, currentDate);
			const isDue = isInvestmentDue(endDate, currentDate);

			return {
				...investment.toObject(),
				currentInterest,
				isDue,
				progress: Math.min((currentInterest / totalInterest) * 100, 100),
			};
		});

		res.json({
			investments: investmentsWithProgress,
			summary: {
				total: activeInvestments.length,
				readyToComplete: investmentsWithProgress.filter(inv => inv.isDue).length,
			}
		});
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

// POST /api/plans/investments/complete-automation - Manual trigger for investment completion (Admin)
router.post("/investments/complete-automation", async (req, res) => {
	try {
		await manualInvestmentCheck();
		res.json({ message: "Investment completion check triggered successfully" });
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
});

export default router;
