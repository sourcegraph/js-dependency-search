import { EMPTY, from, of } from "rxjs";
import { concatMap, toArray } from "rxjs/operators";
import * as sourcegraph from "sourcegraph";

const jsDependencySearchDecorationType = sourcegraph.app.createDecorationType();

export function activate(): void {
    sourcegraph.search.registerQueryTransformer({
        transformQuery: (query: string) => {
            const jsImportsRegex = /\bjs.depends:([^\s]*)/;
            if (query.match(jsImportsRegex)) {
                const jsImportsFilter = query.match(jsImportsRegex);
                const jsPkg =
                    jsImportsFilter && jsImportsFilter.length >= 1
                        ? jsImportsFilter[1]
                        : "";
                const es6Import = "^import.*'" + jsPkg + "[/?^\\s]*'";
                const commonJSImport = "require\\('" + jsPkg + "[^\\s]*'\\)";
                return query.replace(
                    jsImportsRegex,
                    `(${es6Import}|${commonJSImport})`
                );
            }
            return query;
        },
    });

    sourcegraph.workspace.openedTextDocuments.subscribe((doc) => {
        if (
            (doc.languageId !== "typescript" &&
                doc.languageId !== "javascript") ||
            !doc.text
        ) {
            return;
        }
        from(doc.text.split("\n"))
            .pipe(
                concatMap((line, lineNumber) => {
                    // An issue with the second regex is that it'll match lines like
                    //  return "string"
                    const jsPkgRegex =
                        /^import\s.*\'([\w\/]*)[/?^\s]*\'|require\(\'([^\s]*)[^\s]*\'\)/;
                    const match = jsPkgRegex.exec(line);
                    if (match && match.length > 1) {
                        // The match index depends on which regex pattern actually produced a match
                        const pkgName = match[1] ? match[1] : match[2];
                        return of({ lineNumber, pkgName });
                    }
                    return EMPTY;
                }),
                toArray()
            )
            .subscribe((matches) => {
                if (!matches) {
                    return;
                }
                if (
                    sourcegraph.app.activeWindow?.activeViewComponent?.type ===
                    "CodeEditor"
                ) {
                    sourcegraph.app.activeWindow.activeViewComponent.setDecorations(
                        jsDependencySearchDecorationType,
                        matches.map((match) => ({
                            range: new sourcegraph.Range(
                                new sourcegraph.Position(match.lineNumber, 0),
                                new sourcegraph.Position(match.lineNumber, 0)
                            ),
                            after: {
                                contentText: "See all usages",
                                linkURL:
                                    "/search?q=js.depends:" + match.pkgName,
                                backgroundColor: "pink",
                                color: "black",
                            },
                        }))
                    );
                }
            });
    });
}

// See https://about.sourcegraph.com/blog/extension-authoring for instructions and examples.
