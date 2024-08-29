<script>
    import { marked } from 'marked';
    export let toHtml = '';

    marked.use({
        mangle: false,
        headerIds: false
    });
</script>

{#if toHtml}
    {@html marked(toHtml) }
{/if}

<style>
</style>