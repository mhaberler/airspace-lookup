<template>
  <div class="title-bar flex items-center gap-3 h-10 px-3 bg-gray-100 border-b border-gray-300 text-sm select-none shrink-0">
    <div class="flex items-center gap-2">
      <label class="flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          name="mode"
          :checked="mode === 'track'"
          @change="$emit('update:mode', 'track')"
        />
        <span>Track</span>
      </label>
      <label class="flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          name="mode"
          :checked="mode === 'what-if'"
          @change="$emit('update:mode', 'what-if')"
        />
        <span>What-if</span>
      </label>
    </div>

    <div class="h-5 w-px bg-gray-400"></div>

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

    <div class="h-5 w-px bg-gray-400"></div>

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
