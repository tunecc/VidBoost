<script lang="ts">
  import { buildTextShadow, hexToRgba } from '../utils/style-utils';

  export let text: string = '';
  export let fontSize: number = 32;
  export let color: string = '#FFFFFF';
  export let backgroundColor: string = '#000000';
  export let opacity: number = 0.8;
  export let outlined: boolean = false;

  $: textShadow = buildTextShadow(outlined, outlined ? '#000000' : color);
  $: bgColor = outlined ? 'transparent' : hexToRgba(backgroundColor, opacity);
</script>

<div
  class="subtitle-text"
  style="
    font-size: {fontSize}px;
    color: {color};
    background-color: {bgColor};
    text-shadow: {textShadow};
  "
>
  {text}
</div>

<style>
  .subtitle-text {
    display: inline-block;
    padding: 8px 16px;
    text-align: center;
    word-wrap: break-word;
    max-width: 90%;
    font-weight: bold;
    line-height: 1.4;
    border-radius: 4px;
    user-select: none;
    pointer-events: none;
    white-space: pre-wrap;
  }
</style>
