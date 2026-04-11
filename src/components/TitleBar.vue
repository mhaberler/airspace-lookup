<template>
  <div class="title-bar flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-100 border-b border-gray-300 text-sm select-none shrink-0">
    <div class="inline-flex rounded-md border border-gray-400 overflow-hidden shrink-0" role="group" aria-label="Mode">
      <button
        type="button"
        class="px-2.5 py-0.5 text-xs font-medium transition-colors"
        :class="mode === 'track' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'"
        :aria-pressed="mode === 'track'"
        @click="$emit('update:mode', 'track')"
      >Track</button>
      <button
        type="button"
        class="px-2.5 py-0.5 text-xs font-medium border-l border-gray-400 transition-colors"
        :class="mode === 'what-if' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'"
        :aria-pressed="mode === 'what-if'"
        @click="$emit('update:mode', 'what-if')"
      >What-if</button>
    </div>

    <label
      class="flex items-center gap-1"
      :class="mode === 'track' ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
    >
      <input
        type="checkbox"
        :checked="follow"
        :disabled="mode !== 'track'"
        @change="$emit('update:follow', ($event.target as HTMLInputElement).checked)"
      />
      <span>Follow</span>
    </label>

    <label class="flex items-center gap-1 cursor-pointer">
      <input
        type="checkbox"
        :checked="showAirspace"
        @change="$emit('update:showAirspace', ($event.target as HTMLInputElement).checked)"
      />
      <span>Airspace</span>
    </label>
    <label class="flex items-center gap-1 cursor-pointer">
      <input
        type="checkbox"
        :checked="showStack"
        @change="$emit('update:showStack', ($event.target as HTMLInputElement).checked)"
      />
      <span>Stack</span>
    </label>
    <label class="flex items-center gap-1 cursor-pointer">
      <input
        type="checkbox"
        :checked="showAirports"
        @change="$emit('update:showAirports', ($event.target as HTMLInputElement).checked)"
      />
      <span>Airports</span>
    </label>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  mode: 'track' | 'what-if'
  follow: boolean
  showAirspace: boolean
  showStack: boolean
  showAirports: boolean
}>()

defineEmits<{
  (e: 'update:mode', value: 'track' | 'what-if'): void
  (e: 'update:follow', value: boolean): void
  (e: 'update:showAirspace', value: boolean): void
  (e: 'update:showStack', value: boolean): void
  (e: 'update:showAirports', value: boolean): void
}>()
</script>

<style scoped>
.title-bar {
  min-height: 2.5rem;
  padding-top: max(0.375rem, env(safe-area-inset-top));
  padding-bottom: 0.375rem;
  padding-left: max(0.75rem, env(safe-area-inset-left));
  padding-right: max(0.75rem, env(safe-area-inset-right));
}
</style>
