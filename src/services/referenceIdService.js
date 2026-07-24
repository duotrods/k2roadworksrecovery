import {
  doc,
  setDoc,
  getDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { supabase } from '../config/supabase';
import {
  getReferenceConfig,
  getCounterName,
  formatReferenceId,
} from '../utils/referenceFormat';

// Types already ported to Supabase — routed through the generate_reference_id
// RPC (atomic `SELECT ... FOR UPDATE` on the Postgres counters table) instead
// of the Firestore transaction below. Other types stay on Firestore until
// their own migration pass.
const SUPABASE_TYPES = new Set(['incident']);

/**
 * Service for generating unique reference IDs with prefixes
 * Format: PREFIX + number (e.g., IN01, IN02, AD01, etc.)
 * Demo accounts use separate counters with -DEMO suffix (e.g., IN01-DEMO, AD01-DEMO)
 */
class ReferenceIdService {
  /**
   * Generate next reference ID for a given type
   * @param {string} type - The form type (incident, assetDamage, cctvCheck)
   * @param {boolean} isDemo - Whether this is a demo account submission
   * @returns {Promise<string>} The generated reference ID
   */
  async generateReferenceId(type, isDemo = false) {
    if (SUPABASE_TYPES.has(type)) {
      const { data, error } = await supabase.rpc('generate_reference_id', {
        p_type: type,
        p_is_demo: isDemo,
      });
      if (error) {
        console.error('Failed to generate reference ID:', error);
        throw error;
      }
      return data;
    }

    const config = this.getTypeConfig(type);
    const counterName = getCounterName(config, { isDemo });

    try {
      // Use a transaction to ensure atomicity
      const referenceId = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', counterName);
        const counterDoc = await transaction.get(counterRef);

        let nextNumber = 1;

        if (counterDoc.exists()) {
          nextNumber = (counterDoc.data().current || 0) + 1;
          transaction.update(counterRef, { current: nextNumber });
        } else {
          // Initialize counter at 1 (starts fresh at 0 effectively — first ID is 01)
          transaction.set(counterRef, { current: nextNumber });
        }

        return formatReferenceId(config, nextNumber, { isDemo });
      });

      return referenceId;
    } catch (error) {
      console.error('Failed to generate reference ID:', error);
      throw error;
    }
  }

  /**
   * Get configuration for each form type
   * @param {string} type - The form type
   * @returns {Object} Configuration object
   */
  getTypeConfig(type) {
    return getReferenceConfig(type);
  }

  /**
   * Get the current counter value for a form type (for testing/admin purposes)
   * @param {string} type - The form type
   * @returns {Promise<number>} Current counter value
   */
  async getCurrentCount(type) {
    try {
      const config = this.getTypeConfig(type);
      const counterRef = doc(db, 'counters', config.counterName);
      const counterDoc = await getDoc(counterRef);

      if (counterDoc.exists()) {
        return counterDoc.data().current || 0;
      }
      return 0;
    } catch (error) {
      console.error('Failed to get current count:', error);
      return 0;
    }
  }

  /**
   * Reset counter for a form type (admin use only)
   * @param {string} type - The form type
   * @param {number} value - Value to reset to (default: 0)
   */
  async resetCounter(type, value = 0) {
    try {
      const config = this.getTypeConfig(type);
      const counterRef = doc(db, 'counters', config.counterName);
      await setDoc(counterRef, { current: value });
    } catch (error) {
      console.error('Failed to reset counter:', error);
      throw error;
    }
  }
}

export const referenceIdService = new ReferenceIdService();
