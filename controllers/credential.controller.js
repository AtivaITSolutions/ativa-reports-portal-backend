const Credential = require("../models/credential.model");
const User = require("../models/user.model");
const mongoose = require("mongoose");
const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
// Get 32-byte key from env (if shorter/padded/truncated accordingly)
const SECRET_KEY = process.env.CREDENTIAL_SECRET || "default_secret_32_byte_length!!!"; // replace in prod

function getKey() {
  // Ensure key length 32
  return crypto.createHash("sha256").update(String(SECRET_KEY)).digest();
}

function encryptText(plain) {
  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(plain), "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted; // store iv:encrypted
}

function decryptText(cipherText) {
  if (!cipherText || typeof cipherText !== "string") return null;
  const key = getKey();
  const parts = cipherText.split(":");
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Helper: check if requester is allowed to view full password for credential
 * Rules:
 *  - ADMIN always allowed
 *  - requester is credential.createdBy allowed
 *  - requester is the client (credential.clientId) allowed
 *  - AGENT allowed if they are assigned to this client (client.assignedAgentIds includes agent)
 *  - MANAGER allowed if they are manager of a related agent of the client or client.managerId === manager._id
 */
async function canViewPassword(requester, credential) {
  if (!requester || !credential) return false;
  if (requester.role === "ADMIN") return true;
  if (String(requester._id) === String(credential.createdBy)) return true;
  if (String(requester._id) === String(credential.clientId)) return true;

  // fetch client to inspect assignedAgentIds / managerId
  const client = await User.findById(credential.clientId).select("assignedAgentIds managerId role").lean();
  if (!client) return false;

  if (requester.role === "AGENT") {
    // agent can view if they are assigned to client
    if (Array.isArray(client.assignedAgentIds) && client.assignedAgentIds.some(a => String(a) === String(requester._id))) return true;
  }

  if (requester.role === "MANAGER") {
    // manager can view if they are client's manager (denormalized) or manager of any agent assigned to client
    if (client.managerId && String(client.managerId) === String(requester._id)) return true;

    // find agents of this manager and see if any assignedAgentIds include those agents
    // (opt: we can simply check if any assignedAgentIds' managerId == requester._id)
    if (Array.isArray(client.assignedAgentIds) && client.assignedAgentIds.length) {
      const agents = await User.find({ _id: { $in: client.assignedAgentIds }, managerId: requester._id }).select("_id").lean();
      if (agents && agents.length > 0) return true;
    }
  }

  return false;
}

/**
 * Create credential
 * Allowed: ADMIN, AGENT (agents create credentials for their clients), maybe MANAGER? we'll restrict to ADMIN/AGENT for safety
 */
const createCredential = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Unauthorized" });

    // Roles allowed: ADMIN, AGENT
    if (!["ADMIN", "AGENT"].includes(requester.role)) {
      return res.status(403).json({ message: "Only ADMIN or AGENT can create credentials" });
    }

    const { clientId, portalName, username, password } = req.body;
    if (!clientId || !portalName || !username || !password) {
      return res.status(400).json({ message: "clientId, portalName, username and password are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(clientId)) return res.status(400).json({ message: "Invalid clientId" });

    // Optional: verify AGENT is allowed to create for this client (agent assigned to client)
    if (requester.role === "AGENT") {
      const client = await User.findById(clientId).select("assignedAgentIds");
      if (!client) return res.status(404).json({ message: "Client not found" });
      if (!Array.isArray(client.assignedAgentIds) || !client.assignedAgentIds.some(a => String(a) === String(requester._id))) {
        return res.status(403).json({ message: "You can only create credentials for clients assigned to you" });
      }
    }

    const passwordEncrypted = encryptText(password);

    const credential = await Credential.create({
      clientId,
      portalName,
      username,
      passwordEncrypted,
      createdBy: requester._id
    });

    return res.status(201).json({ message: "Credential created", credential });
  } catch (error) {
    console.error("createCredential error:", error);
    return res.status(500).json({ message: "Error creating credential", error: error.message });
  }
};

/**
 * Get all credentials (role-scoped)
 * ADMIN -> all
 * MANAGER -> credentials for clients they manage or their agents' clients
 * AGENT -> credentials for clients assigned to them or createdBy them
 * CLIENT -> credentials for themselves
 *
 * query param showPassword=true will attempt to include decrypted password for those credentials where allowed
 */
const getCredentials = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Unauthorized" });

    const { showPassword } = req.query; // "true" to request decrypted password
    let filter = {};

    if (requester.role === "ADMIN") {
      filter = {}; // all
    } else if (requester.role === "MANAGER") {
      // find agents under this manager
      const agents = await User.find({ role: "AGENT", managerId: requester._id }).select("_id").lean();
      const agentIds = agents.map(a => a._id);

      // find clients where managerId == requester._id OR assignedAgentIds intersect agentIds
      const clients = await User.find({
        role: "CLIENT",
        $or: [
          { managerId: requester._id },
          { assignedAgentIds: { $in: agentIds } }
        ]
      }).select("_id").lean();
      const clientIds = clients.map(c => c._id);
      filter = { clientId: { $in: clientIds } };
    } else if (requester.role === "AGENT") {
      // credentials for clients assigned to this agent OR those created by this agent
      const clients = await User.find({ role: "CLIENT", assignedAgentIds: requester._id }).select("_id").lean();
      const clientIds = clients.map(c => c._id);
      filter = { $or: [{ clientId: { $in: clientIds } }, { createdBy: requester._id }] };
    } else if (requester.role === "CLIENT") {
      filter = { clientId: requester._id };
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const creds = await Credential.find(filter)
      .populate("clientId", "name email")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 })
      .lean();

    // map results and optionally include decrypted password where allowed
    const results = [];
    for (const c of creds) {
      const base = {
        _id: c._id,
        client: c.clientId,
        portalName: c.portalName,
        username: c.username,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };

      if (String(showPassword) === "true") {
        const allowed = await canViewPassword(requester, c);
        base.password = allowed ? decryptText(c.passwordEncrypted) : "****"; // masked if not allowed
        base.passwordShown = allowed;
      } else {
        base.password = "****";
        base.passwordShown = false;
      }

      results.push(base);
    }

    return res.json(results);
  } catch (error) {
    console.error("getCredentials error:", error);
    return res.status(500).json({ message: "Error fetching credentials", error: error.message });
  }
};

/**
 * Get single credential by id
 * query param showPassword=true will attempt to show decrypted password if allowed
 */
const getCredentialById = async (req, res) => {
  try {
    const requester = req.user;
    const { id } = req.params;
    const { showPassword } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid credential id" });

    const c = await Credential.findById(id).populate("clientId", "name email assignedAgentIds managerId").populate("createdBy", "name email role").lean();
    if (!c) return res.status(404).json({ message: "Credential not found" });

    // Authorization: similar scoping as list: check if requester can view this credential at all
    const owns = String(c.clientId._id) === String(requester._id);
    let allowedToView = false;
    if (requester.role === "ADMIN") allowedToView = true;
    else if (requester.role === "CLIENT" && owns) allowedToView = true;
    else if (requester.role === "AGENT") {
      // agent can see if assigned to client or createdBy them
      if (String(c.createdBy._id) === String(requester._id)) allowedToView = true;
      if (Array.isArray(c.clientId.assignedAgentIds) && c.clientId.assignedAgentIds.some(a => String(a) === String(requester._id))) allowedToView = true;
    } else if (requester.role === "MANAGER") {
      // manager can view if manages client or manages an agent assigned to the client
      if (c.clientId.managerId && String(c.clientId.managerId) === String(requester._id)) allowedToView = true;
      if (Array.isArray(c.clientId.assignedAgentIds) && c.clientId.assignedAgentIds.length) {
        const agents = await User.find({ _id: { $in: c.clientId.assignedAgentIds }, managerId: requester._id }).select("_id").lean();
        if (agents && agents.length > 0) allowedToView = true;
      }
    }

    if (!allowedToView) return res.status(403).json({ message: "Access denied" });

    const response = {
      _id: c._id,
      client: c.clientId,
      portalName: c.portalName,
      username: c.username,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    };

    if (String(showPassword) === "true") {
      const allowed = await canViewPassword(requester, c);
      response.password = allowed ? decryptText(c.passwordEncrypted) : "****";
      response.passwordShown = allowed;
    } else {
      response.password = "****";
      response.passwordShown = false;
    }

    return res.json(response);
  } catch (error) {
    console.error("getCredentialById error:", error);
    return res.status(500).json({ message: "Error fetching credential", error: error.message });
  }
};

/**
 * Update credential (ADMIN or creator or agent who created it)
 */
const updateCredential = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid credential id" });

    const credential = await Credential.findById(id);
    if (!credential) return res.status(404).json({ message: "Credential not found" });

    // Authorization: ADMIN or creator
    if (requester.role !== "ADMIN" && String(credential.createdBy) !== String(requester._id)) {
      return res.status(403).json({ message: "Only ADMIN or creator can update the credential" });
    }

    const { portalName, username, password } = req.body;

    if (portalName !== undefined) credential.portalName = portalName;
    if (username !== undefined) credential.username = username;
    if (password !== undefined) credential.passwordEncrypted = encryptText(password);

    await credential.save();

    const updated = await Credential.findById(credential._id).populate("clientId", "name email").populate("createdBy", "name email role");
    return res.json({ message: "Credential updated", credential: updated });
  } catch (error) {
    console.error("updateCredential error:", error);
    return res.status(500).json({ message: "Error updating credential", error: error.message });
  }
};

/**
 * Delete credential (ADMIN or creator)
 */
const deleteCredential = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid credential id" });

    const credential = await Credential.findById(id);
    if (!credential) return res.status(404).json({ message: "Credential not found" });

    if (requester.role !== "ADMIN" && String(credential.createdBy) !== String(requester._id)) {
      return res.status(403).json({ message: "Only ADMIN or creator can delete the credential" });
    }

    await Credential.findByIdAndDelete(id);
    return res.json({ message: "Credential deleted successfully" });
  } catch (error) {
    console.error("deleteCredential error:", error);
    return res.status(500).json({ message: "Error deleting credential", error: error.message });
  }
};

module.exports = {
  createCredential,
  getCredentials,
  getCredentialById,
  updateCredential,
  deleteCredential
};
