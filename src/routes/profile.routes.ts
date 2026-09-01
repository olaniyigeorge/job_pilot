import { Router } from "express";
import { getProfile, createProfile, updateProfile } from "../controllers/profile.controller";

const router = Router();
/**
 * @openapi
 * /api/profile:
 *   get:
 *     summary: Get the user profile
 *     tags: [Profile]
 *     responses:
 *       200:
 *         description: The profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profile'
 *       404:
 *         description: No profile set up yet
 */
router.get("/", getProfile);

/**
 * @openapi
 * /api/profile:
 *   post:
 *     summary: Create the user profile
 *     tags: [Profile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileInput'
 *     responses:
 *       201:
 *         description: Profile created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profile'
 *       409:
 *         description: Profile already exists
 */
router.post("/", createProfile);

/**
 * @openapi
 * /api/profile:
 *   patch:
 *     summary: Update the user profile
 *     tags: [Profile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileInput'
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profile'
 *       404:
 *         description: No profile to update
 */
router.patch("/", updateProfile);

export default router;