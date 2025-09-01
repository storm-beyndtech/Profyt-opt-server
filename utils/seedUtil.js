// seedUtil.js
import mongoose from "mongoose";

const Util = mongoose.model("Util");

const mockData = {
	coins: [
		{
			name: "Bitcoin",
			address: "bc1q8csf9mfg7cyykcyw25uwpqnmwka0lx07hlhrgp",
			network: "BTC",
			price: 118997,
			_id: new mongoose.Types.ObjectId("6593e3525531a494b5b32548"),
		},
		{
			name: "Usdt",
			address: "0x38216890CBd4e1091Aa59dc976916260352fC229",
			network: "ERC20",
			price: 1,
			_id: new mongoose.Types.ObjectId("67683e1585fa55be01c15f9b"),
		},
		{
			name: "Ethereum",
			address: "0x38216890CBd4e1091Aa59dc976916260352fC229",
			network: "ETH",
			price: 2501,
			_id: new mongoose.Types.ObjectId("683502a75c259adaafa38e4f"),
		},
		{
			name: "Usdt",
			address: "TN3d7iTuZkn8JV5DFK3h3UhHrbVgnYypiJ",
			network: "TRC20",
			price: 1,
			_id: new mongoose.Types.ObjectId("683502a75c259adaafa38e50"),
		},
	],
	__v: 0,
};

async function seedUtil() {
	try {
		const count = await Util.countDocuments();
		if (count === 0) {
			await Util.create(mockData);
			console.log("Util collection seeded successfully");
		} else {
			console.log("Util collection is not empty, skipping seeding");
		}
	} catch (error) {
		console.error("Error seeding Util collection:", error);
	}
}

export default seedUtil;
