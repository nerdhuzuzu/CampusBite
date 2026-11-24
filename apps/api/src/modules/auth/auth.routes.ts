import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/auth.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import {
  registerStudent,
  loginStudent,
  loginManager,
  loginAdmin,
  refreshSession,
  logout,
  getMe,
} from "./auth.controller.js";

const router = Router();

// ── Student ──────────────────────────────────────────────────────────────────
router.post(
  "/student/register",
  validate({ body: registerSchema }),
  registerStudent
);
router.post(
  "/student/login",
  validate({ body: loginSchema }),
  loginStudent
);

// ── Manager ──────────────────────────────────────────────────────────────────
router.post(
  "/manager/login",
  validate({ body: loginSchema }),
  loginManager
);

// ── Admin ────────────────────────────────────────────────────────────────────
router.post(
  "/admin/login",
  validate({ body: loginSchema }),
  loginAdmin
);

// ── Session Management ───────────────────────────────────────────────────────
router.post("/refresh", refreshSession);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);

export default router;
