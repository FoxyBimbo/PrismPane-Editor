import { tags as t } from "@lezer/highlight";
import { HighlightStyle } from "@codemirror/language";

const colors = { heading1: "red", heading: "blue" };

const style = HighlightStyle.define([
    { tag: t.heading, color: colors.heading, fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading1, color: colors.heading1, fontSize: '1.6em', fontWeight: 'bold', textDecoration: 'none' },
]);

console.log(style.module.rules);
