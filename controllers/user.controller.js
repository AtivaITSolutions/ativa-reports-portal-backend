const User = require("../models/user.model");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Create user (Admin only)
 */
const createUser = async (req, res) => {
    const { name, username, email, password, role, label, labels, managerId, assignedAgentIds, primaryAgentId } = req.body;
    try {
        // uniqueness
        const exists = await User.findOne({ $or: [{ email }, { username }] });
        if (exists) return res.status(400).json({ message: "User already exists" });

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            username,
            email,
            role,
            label: label || null,
            labels: labels || [],
            managerId: managerId || null,
            assignedAgentIds: assignedAgentIds || [],
            primaryAgentId: primaryAgentId || null,
            passwordHash
        });

        return res.status(201).json({
            message: "User created successfully ✅",
            user: {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                username: newUser.username,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error("createUser error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

/**
 * Get users (role-scoped)
 */
const getUsers = async (req, res) => {
    try {
        const requester = req.user;

        if (requester.role === "ADMIN") {
            const users = await User.find()
                .select("-passwordHash")
                .populate("label labels managerId assignedAgentIds primaryAgentId", "name username email role");
            return res.json(users);
        }

        if (requester.role === "MANAGER") {
            // agents under this manager
            const agents = await User.find({ role: "AGENT", managerId: requester._id })
                .select("-passwordHash")
                .populate("label labels managerId", "name email role");

            // all clients assigned to these agents
            const agentIds = agents.map(a => a._id);
            const clients = await User.find({ role: "CLIENT", assignedAgentIds: { $in: agentIds } })
                .select("-passwordHash")
                .populate("labels assignedAgentIds", "name email role");

            return res.json({ agents, clients });
        }

        if (requester.role === "AGENT") {
            // clients assigned to this agent
            const clients = await User.find({ role: "CLIENT", assignedAgentIds: requester._id })
                .select("-passwordHash")
                .populate("labels assignedAgentIds", "name email role");
            // self
            const self = await User.findById(requester._id).select("-passwordHash").populate("label labels managerId", "name email role");
            return res.json({ self, clients });
        }

        if (requester.role === "CLIENT") {
            const self = await User.findById(requester._id).select("-passwordHash").populate("labels assignedAgentIds primaryAgentId", "name email role");
            return res.json({ self });
        }

        return res.status(403).json({ message: "Access denied" });
    } catch (error) {
        console.error("getUsers error:", error);
        return res.status(500).json({ message: "Error fetching users", error: error.message });
    }
};

/**
 * Get single user by id (role-scoped)
 */
const getUserById = async (req, res) => {
    try {
        const requester = req.user;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user id" });

        const target = await User.findById(id)
            .select("-passwordHash")
            .populate("label labels managerId assignedAgentIds primaryAgentId", "name username email role");
        if (!target) return res.status(404).json({ message: "User not found" });

        // ADMIN
        if (requester.role === "ADMIN") return res.json(target);

        // MANAGER
        if (requester.role === "MANAGER") {
            if ((target.role === "AGENT" && String(target.managerId) === String(requester._id)) || target.role === "CLIENT") {
                return res.json(target);
            }
            return res.status(403).json({ message: "Access denied" });
        }

        // AGENT
        if (requester.role === "AGENT") {
            if (target.role === "CLIENT" && target.assignedAgentIds.includes(requester._id)) return res.json(target);
            if (String(target._id) === String(requester._id)) return res.json(target);
            return res.status(403).json({ message: "Access denied" });
        }

        // CLIENT
        if (requester.role === "CLIENT" && String(target._id) === String(requester._id)) return res.json(target);

        return res.status(403).json({ message: "Access denied" });
    } catch (error) {
        console.error("getUserById error:", error);
        return res.status(500).json({ message: "Error fetching user", error: error.message });
    }
};

/**
 * Update user by id (role-scoped)
 */
const updateUser = async (req, res) => {
    try {
        const requester = req.user;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user id" });

        const target = await User.findById(id);
        if (!target) return res.status(404).json({ message: "User not found" });

        // Authorization checks
        if (requester.role === "ADMIN") {
            // full access
        } else if (requester.role === "MANAGER") {
            if (!(target.role === "AGENT" && String(target.managerId) === String(requester._id))) {
                return res.status(403).json({ message: "Managers can only update their agents" });
            }
        } else if (requester.role === "AGENT" || requester.role === "CLIENT") {
            if (String(target._id) !== String(requester._id)) return res.status(403).json({ message: "You can only update your own profile" });
        } else {
            return res.status(403).json({ message: "Access denied" });
        }

        // Apply updates
        const {
            name, username, email, phone, role,
            label, labels, managerId, assignedAgentIds, primaryAgentId, password
        } = req.body;

        // uniqueness checks
        if (username && username !== target.username) {
            const ex = await User.findOne({ username });
            if (ex) return res.status(400).json({ message: "Username already in use" });
            target.username = username;
        }
        if (email && email !== target.email) {
            const ex = await User.findOne({ email });
            if (ex) return res.status(400).json({ message: "Email already in use" });
            target.email = email;
        }

        if (name) target.name = name;
        if (phone) target.phone = phone;
        if (label !== undefined) target.label = label;
        if (labels !== undefined) target.labels = labels;
        if (primaryAgentId !== undefined) target.primaryAgentId = primaryAgentId;

        if (role) {
            if (role === "ADMIN" && requester.role !== "ADMIN") return res.status(403).json({ message: "Only admin can assign ADMIN role" });
            target.role = role;
        }

        if (managerId !== undefined) {
            if (requester.role !== "ADMIN") return res.status(403).json({ message: "Only admin can change manager assignment" });
            target.managerId = managerId;
        }

        if (assignedAgentIds !== undefined) {
            if (requester.role === "ADMIN") {
                target.assignedAgentIds = assignedAgentIds;
            } else if (requester.role === "MANAGER") {
                // manager can assign only agents under them
                const validAgentIds = await User.find({ _id: { $in: assignedAgentIds }, managerId: requester._id }).select("_id");
                target.assignedAgentIds = validAgentIds.map(a => a._id);
            } else {
                return res.status(403).json({ message: "Not authorized to change assigned agents" });
            }
        }

        if (password) target.passwordHash = await bcrypt.hash(password, 10);

        await target.save();

        const updated = await User.findById(target._id).select("-passwordHash").populate("label labels managerId assignedAgentIds primaryAgentId", "name username email role");
        return res.json({ message: "User updated successfully", user: updated });
    } catch (error) {
        console.error("updateUser error:", error);
        return res.status(500).json({ message: "Error updating user", error: error.message });
    }
};

/**
 * Delete user by id (ADMIN only)
 */
const deleteUser = async (req, res) => {
    try {
        const requester = req.user;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid user id" });

        // Only ADMIN can delete users
        if (requester.role !== "ADMIN")
            return res.status(403).json({ message: "Only admin can delete users" });

        const deleted = await User.findByIdAndDelete(id);
        if (!deleted)
            return res.status(404).json({ message: "User not found" });

        return res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("deleteUser error:", error);
        return res.status(500).json({ message: "Error deleting user", error: error.message });
    }
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser
};