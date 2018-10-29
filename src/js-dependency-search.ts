import { EMPTY, from, of } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';
import * as sourcegraph from 'sourcegraph'

export function activate(): void {
   sourcegraph.search.registerQueryTransformer({
       transformQuery: (query: string) => {
           const jsImportsRegex = /\bjs.depends:([^\s]*)/
           if (query.match(jsImportsRegex)) {
               const jsImportsFilter = query.match(jsImportsRegex)
               const jsPkg = jsImportsFilter && jsImportsFilter.length >= 1 ? jsImportsFilter[1] : ''
               const es6Import = '^import.*\''+jsPkg+'[/?^\\s]*\''
               const commonJSImport = 'require\\(\'' +jsPkg+'[^\\s]*\'\\)'
               return query.replace(jsImportsRegex  , `(${es6Import}|${commonJSImport})`)
           }
           return query
        }
   })

    sourcegraph.workspace.onDidOpenTextDocument.subscribe(doc => {
        from(doc.text.split('\n')).pipe(
            concatMap(
                (line, lineNumber) => {
                    // An issue with the second regex is that it'll match lines like
                    //  return "string"
                    const jsPkgRegex = /^import\s.*\'([\w\/]*)[/?^\s]*\'|require\(\'([^\s]*)[^\s]*\'\)/
                    const match = jsPkgRegex.exec(line);
                    if (match && match.length >= 1) {
                        // For commonJS imports, match[1] is undefined
                        const pkgName = match[1] ? match[1] : match[2]
                        return of({lineNumber, pkgName});
                    }
                    return EMPTY;
                }
            ),
            toArray()
        ).subscribe(matches => {
            if (!matches) {
                return
            }
            if (
                sourcegraph.app.activeWindow &&
                sourcegraph.app.activeWindow.visibleViewComponents.length >
                    0
            ) {
                sourcegraph.app.activeWindow.visibleViewComponents[0].setDecorations(
                    null,
                    matches.map(match => ({
                            range: new sourcegraph.Range(
                                new sourcegraph.Position(match.lineNumber, 0),
                                new sourcegraph.Position(match.lineNumber, 0)
                            ),
                            after: {
                                contentText: ' See all usages',
                                linkURL: '/search?q=js.depends:' + match.pkgName,
                                backgroundColor: 'pink',
                                color: 'black'
                            }
                    })
                ))
            }
            });
    });
}

}

// See https://about.sourcegraph.com/blog/extension-authoring for instructions and examples.
