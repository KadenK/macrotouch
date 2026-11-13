<template>
  <!-- Renders its content into the sidebar of the "sidebar" layout. -->
  <Teleport defer to="#layout-sidebar">
    <slot />
  </Teleport>
</template>
