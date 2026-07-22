import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  getCountFromServer,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { USER_ROLES } from '../utils/constants';
import { MULTI_SCHEME_ROLES } from '../utils/roleHelpers';
import { AppError } from '../utils/errorHandling';

class FirestoreService {
  async createUserDocument(uid, userData) {
    try {
      const userRef = doc(db, 'users', uid);

      // Transform single scheme to array format for multi-scheme support
      const docData = {
        uid,
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        isActive: true,
        canCreateAdmins: false // Default false, manually set in Firestore for super admin
      };

      // If this is a client user with schemeId, convert to multi-scheme format
      if (MULTI_SCHEME_ROLES.has(userData.role) && userData.schemeId) {
        docData.schemeIds = [userData.schemeId];
        docData.schemeNames = {
          [userData.schemeId]: userData.schemeName
        };
        docData.activeSchemeId = userData.schemeId;
        // Keep old fields for backward compatibility
        docData.schemeId = userData.schemeId;
        docData.schemeName = userData.schemeName;
      }

      await setDoc(userRef, docData);
    } catch (error) {
      throw new AppError('Failed to create user document', 'firestore/create-error', error);
    }
  }

  async getUserDocument(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      return userSnap.exists() ? userSnap.data() : null;
    } catch (error) {
      throw new AppError('Failed to fetch user document', 'firestore/read-error', error);
    }
  }

  async updateLastLogin(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update last login:', error);
      // Non-critical, don't throw
    }
  }

  async updateLastLogout(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        lastLogoutAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update last logout:', error);
      // Non-critical, don't throw
    }
  }

  async updateUserProfile(uid, updates) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      throw new AppError('Failed to update profile', 'firestore/update-error', error);
    }
  }

  async updateEmailVerificationStatus(uid, isVerified) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        emailVerified: isVerified,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update email verification:', error);
    }
  }

  // Log activity to activities collection
  async logActivity(activityData) {
    try {
      const activitiesRef = collection(db, 'activities');
      await addDoc(activitiesRef, {
        ...activityData,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
      // Don't throw error - activity logging is non-critical
    }
  }

  // Admin-only: Get all users
  async getAllUsers() {
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      return querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
      throw new AppError('Failed to fetch users', 'firestore/read-error', error);
    }
  }

  // Admin-only: Get all users with pagination and optional role filter
  async getAllUsersPaginated(limitCount = 10, lastDoc = null, role = null) {
    try {
      const usersRef = collection(db, 'users');

      // Build query with pagination and optional role filter
      let q;
      if (role) {
        // With role filter - no orderBy to avoid needing a composite index
        if (lastDoc) {
          q = query(
            usersRef,
            where('role', '==', role),
            startAfter(lastDoc),
            limit(limitCount)
          );
        } else {
          q = query(
            usersRef,
            where('role', '==', role),
            limit(limitCount)
          );
        }
      } else {
        // All users
        if (lastDoc) {
          q = query(
            usersRef,
            orderBy('createdAt', 'desc'),
            startAfter(lastDoc),
            limit(limitCount)
          );
        } else {
          q = query(
            usersRef,
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
        }
      }

      const snapshot = await getDocs(q);
      const users = snapshot.docs.map(doc => doc.data());
      const lastVisible = snapshot.docs[snapshot.docs.length - 1];

      return {
        users,
        lastDoc: lastVisible,
        hasMore: snapshot.docs.length === limitCount
      };
    } catch (error) {
      throw new AppError('Failed to fetch users', 'firestore/read-error', error);
    }
  }

  // Admin-only: Get paginated users
  async getUsersPaginated(limitCount = 50, lastDoc = null) {
    try {
      const usersRef = collection(db, 'users');

      // Build query with pagination
      let q;
      if (lastDoc) {
        // Get next page
        q = query(
          usersRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(limitCount)
        );
      } else {
        // Get first page
        q = query(
          usersRef,
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(q);

      // Get total count using aggregation - 1 read regardless of user count
      const totalSnapshot = await getCountFromServer(query(usersRef));
      const total = totalSnapshot.data().count;

      const users = snapshot.docs.map(doc => doc.data());
      const lastVisible = snapshot.docs[snapshot.docs.length - 1];

      return {
        users,
        total,
        lastDoc: lastVisible,
        hasMore: snapshot.docs.length === limitCount
      };
    } catch (error) {
      throw new AppError('Failed to fetch users', 'firestore/read-error', error);
    }
  }

  /**
   * Get user counts per role using aggregation - only 4 reads total
   */
  async getUsersCountByRole() {
    try {
      const usersRef = collection(db, 'users');
      const [totalSnap, staffSnap, clientSnap, cctvManagersSnap] = await Promise.all([
        getCountFromServer(query(usersRef)),
        getCountFromServer(query(usersRef, where('role', '==', 'staff'))),
        getCountFromServer(query(usersRef, where('role', '==', 'client'))),
        getCountFromServer(query(usersRef, where('role', '==', 'client'), where('canManageCCTVFaults', '==', true))),
      ]);
      return {
        total: totalSnap.data().count,
        staff: staffSnap.data().count,
        client: clientSnap.data().count,
        cctvManagers: cctvManagersSnap.data().count,
      };
    } catch (error) {
      throw new AppError('Failed to count users by role', 'firestore/read-error', error);
    }
  }

  // Admin-only: Get paginated clients with canManageCCTVFaults enabled
  // (the migrated cohort of the removed 'cctvfaultoperator' role)
  async getCCTVFaultManagersPaginated(limitCount = 10, lastDoc = null) {
    try {
      const usersRef = collection(db, 'users');
      const baseFilters = [
        where('role', '==', 'client'),
        where('canManageCCTVFaults', '==', true),
      ];
      const q = lastDoc
        ? query(usersRef, ...baseFilters, startAfter(lastDoc), limit(limitCount))
        : query(usersRef, ...baseFilters, limit(limitCount));

      const snapshot = await getDocs(q);
      const users = snapshot.docs.map(doc => doc.data());
      const lastVisible = snapshot.docs[snapshot.docs.length - 1];

      return {
        users,
        lastDoc: lastVisible,
        hasMore: snapshot.docs.length === limitCount
      };
    } catch (error) {
      throw new AppError('Failed to fetch CCTV fault managers', 'firestore/read-error', error);
    }
  }

  // Admin-only: Update staff role
  async updateUserRole(targetUid, newRole, adminUid) {
    try {
      const targetUserRef = doc(db, 'users', targetUid);
      const targetUser = await getDoc(targetUserRef);

      if (!targetUser.exists()) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Verify target is staff
      if (targetUser.data().role !== USER_ROLES.STAFF) {
        throw new AppError('Can only modify staff roles', 'firestore/permission-denied');
      }

      await updateDoc(targetUserRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });

      // Log audit trail
      await this.createAuditLog({
        action: 'role_change',
        performedBy: adminUid,
        targetUser: targetUid,
        oldValue: targetUser.data().role,
        newValue: newRole
      });
    } catch (error) {
      throw new AppError('Failed to update role', 'firestore/update-error', error);
    }
  }

  async createAuditLog(logData) {
    try {
      const logsRef = collection(db, 'auditLogs');
      await addDoc(logsRef, {
        ...logData,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  // Admin-only: Assign scheme to user
  async assignSchemeToUser(userId, schemeId, schemeName, adminUid) {
    try {
      // Verify admin role
      const adminUser = await this.getUserDocument(adminUid);
      if (adminUser?.role !== USER_ROLES.ADMIN) {
        throw new AppError('Unauthorized', 'firestore/permission-denied');
      }

      // Get target user
      const targetUser = await this.getUserDocument(userId);
      if (!targetUser) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Verify target role supports multi-scheme assignment
      if (!MULTI_SCHEME_ROLES.has(targetUser.role)) {
        throw new AppError('Cannot assign schemes to this role', 'firestore/permission-denied');
      }

      // Check if scheme already assigned
      const currentSchemes = targetUser.schemeIds || [];
      if (currentSchemes.includes(schemeId)) {
        throw new AppError('Scheme already assigned to this user', 'firestore/already-exists');
      }

      // Update user schemes
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        schemeIds: [...currentSchemes, schemeId],
        schemeNames: {
          ...(targetUser.schemeNames || {}),
          [schemeId]: schemeName
        },
        // If this is the first scheme, set it as active
        ...(currentSchemes.length === 0 && { activeSchemeId: schemeId }),
        updatedAt: serverTimestamp()
      });

      // Log audit trail
      await this.createAuditLog({
        action: 'scheme_assigned',
        performedBy: adminUid,
        targetUser: userId,
        schemeId: schemeId,
        schemeName: schemeName
      });

      return { success: true, message: 'Scheme assigned successfully' };
    } catch (error) {
      console.error('assignSchemeToUser error:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to assign scheme', 'firestore/update-error', error);
    }
  }

  // Admin-only: Remove scheme from user
  async removeSchemeFromUser(userId, schemeId, adminUid) {
    try {
      // Verify admin role
      const adminUser = await this.getUserDocument(adminUid);
      if (adminUser?.role !== USER_ROLES.ADMIN) {
        throw new AppError('Unauthorized', 'firestore/permission-denied');
      }

      // Get target user
      const targetUser = await this.getUserDocument(userId);
      if (!targetUser) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Check if user has multiple schemes
      const currentSchemes = targetUser.schemeIds || [];
      if (currentSchemes.length <= 1) {
        throw new AppError('Cannot remove the only scheme from a user', 'firestore/invalid-operation');
      }

      // Remove scheme from arrays
      const updatedSchemes = currentSchemes.filter(id => id !== schemeId);
      const updatedSchemeNames = { ...(targetUser.schemeNames || {}) };
      delete updatedSchemeNames[schemeId];

      // Update user document
      const userRef = doc(db, 'users', userId);
      const updateData = {
        schemeIds: updatedSchemes,
        schemeNames: updatedSchemeNames,
        updatedAt: serverTimestamp()
      };

      // If removing the active scheme, set new active scheme
      if (targetUser.activeSchemeId === schemeId) {
        updateData.activeSchemeId = updatedSchemes[0];
      }

      await updateDoc(userRef, updateData);

      // Log audit trail
      await this.createAuditLog({
        action: 'scheme_removed',
        performedBy: adminUid,
        targetUser: userId,
        schemeId: schemeId
      });

      return { success: true, message: 'Scheme removed successfully' };
    } catch (error) {
      throw new AppError('Failed to remove scheme', 'firestore/update-error', error);
    }
  }

  // Admin-only: Promote staff to admin
  async promoteToAdmin(targetUid, adminUid) {
    try {
      // Verify admin role
      const adminUser = await this.getUserDocument(adminUid);
      if (adminUser?.role !== USER_ROLES.ADMIN) {
        throw new AppError('Unauthorized', 'firestore/permission-denied');
      }

      // Get target user
      const targetUser = await this.getUserDocument(targetUid);
      if (!targetUser) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Verify target is staff
      if (targetUser.role !== USER_ROLES.STAFF) {
        throw new AppError('Can only promote staff users to admin', 'firestore/permission-denied');
      }

      // Prevent self-promotion
      if (targetUid === adminUid) {
        throw new AppError('Cannot promote yourself', 'firestore/invalid-operation');
      }

      // Update user role to admin
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        role: USER_ROLES.ADMIN,
        updatedAt: serverTimestamp()
      });

      // Log audit trail
      await this.createAuditLog({
        action: 'promote_to_admin',
        performedBy: adminUid,
        targetUser: targetUid,
        oldValue: USER_ROLES.STAFF,
        newValue: USER_ROLES.ADMIN,
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.displayName
      });

      return { success: true, message: 'User promoted to admin successfully' };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to promote user', 'firestore/update-error', error);
    }
  }

  // Admin-only: Archive user
  async archiveUser(targetUid, adminUid) {
    try {
      // Verify admin role
      const adminUser = await this.getUserDocument(adminUid);
      if (adminUser?.role !== USER_ROLES.ADMIN) {
        throw new AppError('Unauthorized', 'firestore/permission-denied');
      }

      // Get target user
      const targetUser = await this.getUserDocument(targetUid);
      if (!targetUser) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Prevent archiving other admins
      if (targetUser.role === USER_ROLES.ADMIN) {
        throw new AppError('Cannot archive admin users', 'firestore/permission-denied');
      }

      // Prevent self-archiving
      if (targetUid === adminUid) {
        throw new AppError('Cannot archive yourself', 'firestore/invalid-operation');
      }

      // Update user document to mark as archived
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedBy: adminUid,
        updatedAt: serverTimestamp()
      });

      // Log activity
      await this.logActivity({
        userId: adminUid,
        userName: adminUser.displayName || adminUser.email,
        action: 'user_archived',
        details: `Archived user: ${targetUser.displayName || targetUser.email}`,
        targetUserId: targetUid,
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.displayName
      });

      return { success: true, message: 'User archived successfully' };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to archive user', 'firestore/update-error', error);
    }
  }

  // Admin-only: Unarchive user
  async unarchiveUser(targetUid, adminUid) {
    try {
      // Verify admin role
      const adminUser = await this.getUserDocument(adminUid);
      if (adminUser?.role !== USER_ROLES.ADMIN) {
        throw new AppError('Unauthorized', 'firestore/permission-denied');
      }

      // Get target user
      const targetUser = await this.getUserDocument(targetUid);
      if (!targetUser) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Update user document to remove archive status
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        unarchivedAt: serverTimestamp(),
        unarchivedBy: adminUid,
        updatedAt: serverTimestamp()
      });

      // Log activity
      await this.logActivity({
        userId: adminUid,
        userName: adminUser.displayName || adminUser.email,
        action: 'user_unarchived',
        details: `Unarchived user: ${targetUser.displayName || targetUser.email}`,
        targetUserId: targetUid,
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.displayName
      });

      return { success: true, message: 'User unarchived successfully' };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to unarchive user', 'firestore/update-error', error);
    }
  }

  // Admin-only: Delete user (calls Cloud Function to delete from both Auth and Firestore)
  async deleteUser(targetUid, adminUid) {
    try {
      // Verify admin role
      const adminUser = await this.getUserDocument(adminUid);
      if (adminUser?.role !== USER_ROLES.ADMIN) {
        throw new AppError('Unauthorized', 'firestore/permission-denied');
      }

      // Get target user
      const targetUser = await this.getUserDocument(targetUid);
      if (!targetUser) {
        throw new AppError('User not found', 'firestore/not-found');
      }

      // Prevent deleting other admins
      if (targetUser.role === USER_ROLES.ADMIN) {
        throw new AppError('Cannot delete admin users', 'firestore/permission-denied');
      }

      // Prevent self-deletion
      if (targetUid === adminUid) {
        throw new AppError('Cannot delete yourself', 'firestore/invalid-operation');
      }

      // Call the Cloud Function to delete user from both Auth and Firestore
      const deleteUserAccount = httpsCallable(functions, 'deleteUserAccount');
      const result = await deleteUserAccount({ targetUid });

      return { success: true, message: result.data.message };
    } catch (error) {
      console.error('Delete user error details:', error);

      // Handle Cloud Function errors
      if (error.code) {
        const message = error.message || 'Failed to delete user';
        throw new AppError(message, error.code, error);
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Failed to delete user: ${error.message || 'Unknown error'}`,
        'firestore/delete-error',
        error
      );
    }
  }

  // ── Login Audit Logs ──────────────────────────────────────────────────────
  // Each doc has an expireAt field. Enable Firestore TTL on loginLogs.expireAt
  // in the Firebase console to auto-delete documents after 15 days.

  async logUserLogin(userId, displayName, email, role) {
    const expireAt = Timestamp.fromDate(
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    );
    await addDoc(collection(db, 'loginLogs'), {
      userId,
      displayName: displayName || 'Unknown',
      email: email || '',
      role: role || 'unknown',
      loginAt: serverTimestamp(),
      expireAt,
    });
  }

  async getLoginLogsPaginated(pageSize = 10, lastDoc = null) {
    let q = query(
      collection(db, 'loginLogs'),
      orderBy('loginAt', 'desc'),
      limit(pageSize + 1)
    );
    if (lastDoc) {
      q = query(
        collection(db, 'loginLogs'),
        orderBy('loginAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize + 1)
      );
    }
    const snap = await getDocs(q);
    const hasMore = snap.docs.length > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    return {
      logs: docs.map(d => ({ id: d.id, ...d.data() })),
      lastDoc: docs[docs.length - 1] || null,
      hasMore,
    };
  }

  async getLoginLogsCount() {
    const snap = await getCountFromServer(collection(db, 'loginLogs'));
    return snap.data().count;
  }

  async getUsersBySchemeAndRoles(schemeId, roles) {
    try {
      const usersRef = collection(db, 'users');
      const results = await Promise.all(
        roles.map(role =>
          getDocs(query(usersRef, where('role', '==', role), where('schemeIds', 'array-contains', schemeId)))
        )
      );
      return results.flatMap(snapshot =>
        snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
      );
    } catch (error) {
      throw new AppError('Failed to fetch users by scheme', 'firestore/read-error', error);
    }
  }
}

export const firestoreService = new FirestoreService();
