import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email must be under 255 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be under 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/,
      "Password must contain at least one uppercase, one lowercase, one digit, and one special character"
    ),
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name must be under 100 characters")
    .trim(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name must be under 100 characters")
    .trim(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number")
    .optional(),
  enrollmentNo: z.string().max(50).optional(),
  department: z.string().max(100).optional(),
  year: z.coerce.number().int().min(1).max(6).optional(),
  dietaryType: z.enum(["VEG", "NON_VEG", "VEGAN", "EGG"]).optional().default("VEG"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
