import express from "express";

const router = express.Router();

router.get("", (_req, res) => {
  res.json({ msg: "ok" });
});

export default router;
