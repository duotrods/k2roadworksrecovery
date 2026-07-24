import { supabase } from '../config/supabase';
import { getReferenceConfig } from '../utils/referenceFormat';

/**
 * Service for generating unique reference IDs with prefixes
 * Format: PREFIX + number (e.g., IN01, IN02, CH01, etc.)
 * Demo accounts use separate counters with -DEMO suffix (e.g., IN01-DEMO, CH01-DEMO)
 */
class ReferenceIdService {
  /**
   * Generate next reference ID for a given type — routed through the
   * generate_reference_id RPC (atomic `SELECT ... FOR UPDATE` on the
   * Postgres counters table).
   * @param {string} type - The form type (incident, cabinSafety, vehicleCheck, dailyAllocation)
   * @param {boolean} isDemo - Whether this is a demo account submission
   * @returns {Promise<string>} The generated reference ID
   */
  async generateReferenceId(type, isDemo = false) {
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

  /**
   * Get configuration for each form type
   * @param {string} type - The form type
   * @returns {Object} Configuration object
   */
  getTypeConfig(type) {
    return getReferenceConfig(type);
  }
}

export const referenceIdService = new ReferenceIdService();
