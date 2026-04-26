import { createServiceClient } from '@/lib/supabase'

/**
 * Atomically deducts `cost` credits from user.
 *
 * Strategy:
 * 1. Try Supabase RPC `deduct_credits(p_user_id, p_cost)` for true atomicity.
 *    Expected SQL:
 *      UPDATE users SET credits = credits - p_cost
 *        WHERE id = p_user_id AND credits >= p_cost
 *      RETURNING credits
 * 2. If the RPC doesn't exist (error code 42883 / PGRST202), fall back to
 *    a conditional UPDATE with .gte('credits', cost) and rowCount check.
 *    This prevents going negative even under mild concurrency.
 */
export async function deductCredits(
  userId: string,
  cost: number
): Promise<{ success: boolean; remaining?: number; error?: string }> {
  if (cost <= 0) return { success: true }

  const db = createServiceClient()

  // --- Try atomic RPC ---
  const { data: rpcData, error: rpcError } = await db.rpc('deduct_credits', {
    p_user_id: userId,
    p_cost: cost,
  })

  if (!rpcError) {
    // RPC returns null/false when credits were insufficient, or the new balance
    if (rpcData === null || rpcData === false) {
      return { success: false, error: '积分不足' }
    }
    return { success: true, remaining: typeof rpcData === 'number' ? rpcData : undefined }
  }

  // Only fall back if the error is "function not found"
  const isNotFound = rpcError.code === '42883' || rpcError.code === 'PGRST202'
  if (!isNotFound) {
    return { success: false, error: rpcError.message }
  }

  // --- Fallback: conditional UPDATE + rowCount check ---
  // Read current balance first (used to compute the new value to write)
  const { data: user, error: readError } = await db
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single()

  if (readError) return { success: false, error: readError.message }

  const current = user?.credits ?? 0
  if (current < cost) {
    return { success: false, error: '积分不足' }
  }

  // UPDATE ... WHERE id = userId AND credits >= cost
  // If another request already deducted credits between our read and this write,
  // the gte filter will prevent the update from running (rowCount = 0).
  const { data: updated, error: updateError } = await db
    .from('users')
    .update({ credits: current - cost })
    .eq('id', userId)
    .gte('credits', cost)
    .select('credits')

  if (updateError) return { success: false, error: updateError.message }

  if (!updated || updated.length === 0) {
    return { success: false, error: '积分不足或并发冲突，请重试' }
  }

  return { success: true, remaining: updated[0].credits }
}
